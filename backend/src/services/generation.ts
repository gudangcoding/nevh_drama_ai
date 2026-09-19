/**
 * Layanan tugas generasi terpadu — pembuatan gambar/video menggunakan tabel sys_task yang sama dan siklus hidup yang sama:
 * Membuat(processing) → adapter membangun request → selesai sinkron atau polling asinkron → mengunduh ke disk → menulis kembali ke tabel bisnis
 */
import { db, getInsertId, schema } from '../db/index.js'
import { and, eq, isNull } from 'drizzle-orm'
import { getActiveConfig, getConfigById } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, fetchImageAsCompressedDataUrl, generateImageThumb, readImageAsCompressedDataUrl, saveBase64Image } from '../utils/storage.js'
import { extractVideoLastFrame, extractVideoPoster } from '../utils/video-poster.js'
import { getImageAdapter, getVideoAdapter } from './adapters/registry'
import type { AIConfig } from './adapters/types'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { translateApiError } from '../utils/error-translate.js'
import { robustFetch } from '../utils/http.js'

type TaskType = 'image' | 'video'

const taskLabel = (type: TaskType) => (type === 'image' ? 'ImageTask' : 'VideoTask')

// Pembatas konkurensi global untuk pemrosesan task: mencegah semua tugas generasi
// dijalankan serentak (penyebab sering timeoute/gagal saat produksi otomatis besar).
// Default 2; dapat diubah dengan env AI_TASK_CONCURRENCY.
const MAX_CONCURRENT_TASKS = clampTaskConcurrency(process.env.AI_TASK_CONCURRENCY)
let activeTaskCount = 0
const taskWaiters: Array<() => void> = []

function clampTaskConcurrency(raw: string | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 2
  return Math.min(8, Math.round(n))
}

function acquireTaskSlot(): Promise<void> {
  if (activeTaskCount < MAX_CONCURRENT_TASKS) {
    activeTaskCount++
    return Promise.resolve()
  }
  return new Promise(resolve => taskWaiters.push(resolve))
}

function releaseTaskSlot(): void {
  const next = taskWaiters.shift()
  if (next) {
    next()
  } else {
    activeTaskCount = Math.max(0, activeTaskCount - 1)
  }
}

// Ritme polling: gambar 5s×120 (batas 10 menit); video 10s×300
const POLL_PROFILES: Record<TaskType, { attempts: number; intervalMs: number; maxDurationMs: number | null }> = {
  image: { attempts: 120, intervalMs: 5000, maxDurationMs: 600_000 },
  video: { attempts: 300, intervalMs: 10_000, maxDurationMs: null },
}

interface GenerateImageParams {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  propId?: number
  /** Saat diisi, hasil gambar ditulis balik ke dramas.thumbnail (sampul proyek) */
  coverDramaId?: number
  prompt: string
  model?: string
  size?: string
  referenceImages?: string[]
  frameType?: string
  configId?: number
}

interface GenerateVideoParams {
  storyboardId?: number
  dramaId?: number
  prompt: string
  model?: string
  referenceMode?: string
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
  referenceFileUrl?: string
  referenceLinkUrl?: string
  generateAudio?: boolean
  duration?: number
  aspectRatio?: string
  resolution?: string
  seed?: number
  promptExtend?: boolean
  watermark?: boolean
  configId?: number
}

/** Provider yang mendukung first_frame berdampingan dengan gambar referensi */
const CHAIN_FIRST_FRAME_PROVIDERS = new Set(['gemini', 'minimax'])

/**
 * Cari frame terakhir video shot sebelumnya (nomor storyboard lebih kecil dalam
 * episode yang sama, yang sudah punya video). Mengembalikan path relatif frame
 * (static/frames/...) atau null bila tidak ada/tidak bisa diekstrak.
 */
async function resolveChainFrame(storyboardId: number, _provider: string): Promise<string | null> {
  const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId))
  if (!sb?.episodeId || sb.storyboardNumber == null) return null
  const siblings = await db.select().from(schema.storyboards)
    .where(and(eq(schema.storyboards.episodeId, sb.episodeId), isNull(schema.storyboards.deletedAt)))
  const prev = siblings
    .filter(x => !x.deletedAt && (x.storyboardNumber || 0) < (sb.storyboardNumber || 0))
    .sort((a, b) => (a.storyboardNumber || 0) - (b.storyboardNumber || 0))
    .pop()
  const videoRel = prev?.videoUrl || prev?.composedVideoUrl
  if (!videoRel) return null
  return extractVideoLastFrame(videoRel)
}

export async function generateImage(params: GenerateImageParams): Promise<number> {
  // Konfigurasi yang ditetapkan (dikunci per episode) mungkin telah dinonaktifkan/dihapus/dari penyedia yang sudah tidak tersedia, jika tidak valid fallback ke konfigurasi aktif saat ini agar generasi tidak terjebak oleh referensi lama
  const config = params.configId
    ? (await getConfigById(params.configId)) ?? await getActiveConfig('image')
    : await getActiveConfig('image')
  if (!config) throw new Error('Model gambar belum dikonfigurasi, silakan tambah dan aktifkan layanan AI di halaman "Pengaturan"')

  const id = await createTask('image', config, {
    storyboardId: params.storyboardId,
    dramaId: params.coverDramaId || params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    propId: params.propId,
    prompt: params.prompt,
    model: params.model || config.model,
  }, {
    size: params.size || '1920x1080',
    frameType: params.frameType,
    referenceImages: params.referenceImages,
    coverDramaId: params.coverDramaId,
  })

  logTaskStart('ImageTask', 'enqueue', {
    id,
    provider: config.provider,
    storyboardId: params.storyboardId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    frameType: params.frameType,
    model: params.model || config.model,
  })
  logTaskPayload('ImageTask', 'enqueue params', {
    id,
    config: { provider: config.provider, model: config.model, baseUrl: config.baseUrl },
    params,
  })
  return id
}

export async function generateVideo(params: GenerateVideoParams): Promise<number> {
  // Konfigurasi yang ditetapkan (dikunci per episode) mungkin telah dinonaktifkan/dihapus/dari penyedia yang sudah tidak tersedia, jika tidak valid fallback ke konfigurasi aktif saat ini
  const config = params.configId
    ? (await getConfigById(params.configId)) ?? await getActiveConfig('video')
    : await getActiveConfig('video')
  if (!config) throw new Error('Model video belum dikonfigurasi, silakan tambah dan aktifkan layanan AI di halaman "Pengaturan"')

  // Chaining antar shot (aksi bersambung ala Pipit): frame terakhir video shot
  // sebelumnya dalam episode yang sama dijadikan acuan shot ini, agar sambungan
  // hard cut terlihat natural — bukan dua klip asing yang ditempel.
  if (params.storyboardId && !params.firstFrameUrl) {
    try {
      const chainFrame = await resolveChainFrame(params.storyboardId, config.provider)
      if (chainFrame) {
        if (CHAIN_FIRST_FRAME_PROVIDERS.has(config.provider)) {
          params.firstFrameUrl = chainFrame
        } else if (config.provider !== 'aliyun') {
          // Provider tanpa first_frame (mis. Seedance/volcengine): jadikan gambar
          // referensi pertama. Aliyun/Wan dikecualikan — mode first_frame-nya
          // eksklusif (tak boleh campur reference), jadi andalkan prompt + trim.
          params.referenceImageUrls = [chainFrame, ...(params.referenceImageUrls || [])].slice(0, 9)
        }
        logTaskProgress('VideoTask', 'chain-frame', {
          storyboardId: params.storyboardId,
          provider: config.provider,
          mode: CHAIN_FIRST_FRAME_PROVIDERS.has(config.provider) ? 'first_frame' : 'reference',
        })
      }
    } catch (err: any) {
      logTaskWarn('VideoTask', 'chain-frame-skipped', { storyboardId: params.storyboardId, error: String(err?.message || err) })
    }
  }

  const id = await createTask('video', config, {
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    prompt: params.prompt,
    model: params.model || config.model,
  }, {
    referenceMode: params.referenceMode || 'reference',
    imageUrl: params.imageUrl,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    referenceImageUrls: params.referenceImageUrls,
    referenceVideoUrls: params.referenceVideoUrls,
    referenceAudioUrls: params.referenceAudioUrls,
    referenceFileUrl: params.referenceFileUrl,
    referenceLinkUrl: params.referenceLinkUrl,
    generateAudio: params.generateAudio === false ? 0 : 1,
    duration: params.duration,
    aspectRatio: params.aspectRatio,
    // Disimpan dalam format internal proyek, masing-masing adapter akan mengonversi ke huruf besar/kecil resmi dan enumerasi.
    resolution: normalizeStoredVideoResolution(params.resolution),
    seed: params.seed,
    promptExtend: params.promptExtend,
    watermark: params.watermark,
  })

  logTaskStart('VideoTask', 'enqueue', {
    id,
    provider: config.provider,
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    referenceMode: params.referenceMode || 'reference',
    duration: params.duration || 5,
  })
  logTaskPayload('VideoTask', 'enqueue params', {
    id,
    config: { provider: config.provider, model: config.model, baseUrl: config.baseUrl },
    params,
  })
  return id
}

async function createTask(
  type: TaskType,
  config: AIConfig,
  fields: {
    storyboardId?: number
    dramaId?: number
    sceneId?: number
    characterId?: number
    propId?: number
    prompt: string
    model?: string | null
  },
  params: Record<string, unknown>,
): Promise<number> {
  const ts = now()
  const res = await db.insert(schema.sysTask).values({
    type,
    ...fields,
    provider: config.provider,
    params: JSON.stringify(params),
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  })

  const id = getInsertId(res)
  void acquireTaskSlot().then(() =>
    processTask(id, config).finally(releaseTaskSlot)
  ).catch(err => {
    logTaskError(taskLabel(type), 'process', { id, error: err.message })
    console.error(`${taskLabel(type)} ${id} failed:`, err)
  })
  return id
}

function parseTaskParams(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) || {}
  } catch {
    return {}
  }
}

async function processTask(id: number, config: AIConfig) {
  try {
    const [record] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
    if (!record) return
    const type = record.type as TaskType
    const label = taskLabel(type)
    const params = parseTaskParams(record.params)
    logTaskProgress(label, 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      sceneId: record.sceneId,
      characterId: record.characterId,
    })

    let url: string, method: string, headers: Record<string, string>, body: unknown

    if (type === 'image') {
      const adapter = getImageAdapter(config.provider)
      const resolvedReferenceImages = await normalizeReferenceImages(params.referenceImages)
      ;({ url, method, headers, body } = adapter.buildGenerateRequest(config, {
        id: record.id,
        model: record.model,
        prompt: record.prompt,
        size: params.size,
        frameType: params.frameType,
        referenceImages: resolvedReferenceImages.length ? JSON.stringify(resolvedReferenceImages) : null,
      }))
    } else {
      const adapter = getVideoAdapter(config.provider)
      const resolvedImageUrl = await normalizeVideoReferenceUrl(params.imageUrl)
      const resolvedFirstFrameUrl = await normalizeVideoReferenceUrl(params.firstFrameUrl)
      const resolvedLastFrameUrl = await normalizeVideoReferenceUrl(params.lastFrameUrl)
      const resolvedReferenceImageUrls = await normalizeVideoReferenceUrls(params.referenceImageUrls)
      // File video/audio referensi cukup besar, tidak cocok untuk dataURL inline, perlu diurai menjadi URL yang dapat diakses publik
      const resolvedReferenceVideoUrls = resolvePublicMediaUrls(params.referenceVideoUrls, 'video')
      const resolvedReferenceAudioUrls = resolvePublicMediaUrls(params.referenceAudioUrls, 'audio')
      const resolvedReferenceFileUrl = resolvePublicMediaUrl(params.referenceFileUrl, 'file')
      ;({ url, method, headers, body } = adapter.buildGenerateRequest(config, {
        id: record.id,
        model: record.model,
        prompt: record.prompt,
        referenceMode: params.referenceMode,
        imageUrl: resolvedImageUrl,
        firstFrameUrl: resolvedFirstFrameUrl,
        lastFrameUrl: resolvedLastFrameUrl,
        referenceImageUrls: resolvedReferenceImageUrls.length ? JSON.stringify(resolvedReferenceImageUrls) : null,
        referenceVideoUrls: resolvedReferenceVideoUrls.length ? JSON.stringify(resolvedReferenceVideoUrls) : null,
        referenceAudioUrls: resolvedReferenceAudioUrls.length ? JSON.stringify(resolvedReferenceAudioUrls) : null,
        referenceFileUrl: resolvedReferenceFileUrl,
        referenceLinkUrl: params.referenceLinkUrl,
        generateAudio: params.generateAudio,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        seed: params.seed,
        promptExtend: params.promptExtend,
        watermark: params.watermark,
      }))
    }

    logTaskProgress(label, 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
    })

    const isMultipart = body instanceof FormData
    logTaskPayload(label, 'request payload', {
      id, method, url, headers,
      // Form multipart (seperti OpenAI /v1/images/edits) tidak dapat di-JSON, mencatat ringkasan field
      body: isMultipart ? `[multipart/form-data: ${[...(body as FormData).keys()].join(', ')}]` : body,
    })

    const resp = await robustFetch(url, {
      method,
      headers,
      body: isMultipart ? (body as FormData) : JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
    })

    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const result = await resp.json() as any
    logTaskPayload(label, 'response payload', { id, provider: config.provider, result })

    if (type === 'image') {
      const adapter = getImageAdapter(config.provider)
      const { isAsync, taskId, imageUrl } = adapter.parseGenerateResponse(result)

      if (!isAsync && imageUrl) {
        logTaskProgress(label, 'sync-complete', { id, imageUrl })
        await handleImageComplete(record, imageUrl)
        return
      }

      if (!isAsync && !imageUrl) {
        // Mode sinkron tanpa URL (Gemini dll mengembalikan base64)
        const b64 = adapter.extractImageBase64(result)
        if (b64) {
          logTaskProgress(label, 'sync-base64-complete', { id, mimeType: b64.mimeType })
          await handleImageCompleteBase64(record, b64.data, b64.mimeType)
          return
        }
        throw new Error('No image URL or base64 data in response')
      }

      await markPolling(id, taskId)
      pollTask(record, config, taskId!)
      return
    }

    const adapter = getVideoAdapter(config.provider)
    const { isAsync, taskId, videoUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && videoUrl) {
      logTaskProgress(label, 'sync-complete', { id, videoUrl })
      await handleVideoComplete(record, videoUrl, params.duration, geminiDownloadHeaders(config))
      return
    }

    await markPolling(id, taskId)
    pollTask(record, config, taskId!)
  } catch (err: any) {
    await failTask(id, err.message)
  }
}

async function markPolling(id: number, taskId: string | undefined) {
  await db.update(schema.sysTask)
    .set({ taskId, status: 'processing', updatedAt: now() })
    .where(eq(schema.sysTask.id, id))
  logTaskProgress('SysTask', 'poll-start', { id, taskId })
}

async function failTask(id: number, message: string) {
  const translated = translateApiError(message)
  logTaskError('SysTask', 'failed', { id, error: translated })
  await db.update(schema.sysTask)
    .set({ status: 'failed', errorMsg: translated, updatedAt: now() })
    .where(eq(schema.sysTask.id, id))
}

type SysTaskRecord = typeof schema.sysTask.$inferSelect

async function pollTask(record: SysTaskRecord, config: AIConfig, taskId: string) {
  const type = record.type as TaskType
  const label = taskLabel(type)
  const profile = POLL_PROFILES[type]
  const adapter = type === 'image' ? getImageAdapter(config.provider) : getVideoAdapter(config.provider)
  const startedAt = Date.now()

  for (let i = 0; i < profile.attempts; i++) {
    if (profile.maxDurationMs && Date.now() - startedAt >= profile.maxDurationMs) {
      await failTask(record.id, 'Timeout: Polling exceeded 10 minutes')
      return
    }
    await new Promise(r => setTimeout(r, profile.intervalMs))
    try {
      const { url, method, headers } = adapter.buildPollRequest(config, taskId)
      logTaskProgress(label, 'poll-request', {
        id: record.id,
        taskId,
        provider: config.provider,
        method,
        url: redactUrl(url),
        attempt: i + 1,
      })
      const remainingMs = profile.maxDurationMs
        ? Math.max(1_000, profile.maxDurationMs - (Date.now() - startedAt))
        : 600_000
      const resp = await robustFetch(url, {
        method,
        headers,
        signal: AbortSignal.timeout(remainingMs),
      })
      if (!resp.ok) continue
      const result = await resp.json() as any

      // Struktur PollResponse gambar/video berbeda, di sini diambil nilainya secara umum sebagai any lalu dibagi berdasarkan type
      const pollResp: any = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed') {
        if (type === 'image') {
          if (pollResp.imageUrl) {
            logTaskSuccess(label, 'poll-complete', { id: record.id, taskId, imageUrl: pollResp.imageUrl })
            await handleImageComplete(record, pollResp.imageUrl)
            return
          }
          if (adapter.provider === 'gemini') {
            // Gemini mungkin mengembalikan base64
            const b64 = (adapter as ReturnType<typeof getImageAdapter>).extractImageBase64(result)
            if (b64) {
              logTaskSuccess(label, 'poll-base64-complete', { id: record.id, taskId, mimeType: b64.mimeType })
              await handleImageCompleteBase64(record, b64.data, b64.mimeType)
              return
            }
          }
        } else if (pollResp.videoUrl) {
          logTaskSuccess(label, 'poll-complete', { id: record.id, taskId, videoUrl: pollResp.videoUrl })
          await handleVideoComplete(record, pollResp.videoUrl, pollResp.duration, geminiDownloadHeaders(config))
          return
        }
      }
      if (pollResp.status === 'failed') {
        // Kegagalan eksplisit dari hulu (seperti pemblokiran moderasi konten) adalah status akhir: langsung disimpan ke database, tidak ada retry atau menunggu timeout
        await failTask(record.id, pollResp.error || 'Generation failed')
        return
      }
    } catch (err: any) {
      const exhausted = i === profile.attempts - 1
        || (profile.maxDurationMs != null && Date.now() - startedAt >= profile.maxDurationMs)
      if (exhausted) {
        await failTask(record.id, `Timeout: ${err.message}`)
        return
      }
      logTaskWarn(label, 'poll-retry', { id: record.id, taskId, attempt: i + 1, error: err.message })
    }
  }
  await failTask(record.id, 'Timeout: polling attempts exhausted')
}

async function handleImageComplete(record: SysTaskRecord, imageUrl: string) {
  const localPath = await downloadFile(imageUrl, 'images')
  // Thumbnail halaman daftar (frontend menurunkan alamat berdasarkan konvensi penamaan, kegagalan tidak mempengaruhi alur utama)
  await generateImageThumb(localPath)

  await db.update(schema.sysTask)
    .set({ resultUrl: imageUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(eq(schema.sysTask.id, record.id))

  logTaskSuccess('ImageTask', 'downloaded', { id: record.id, provider: record.provider, localPath })

  await writeBackImageAssets(record, localPath)
}

async function handleImageCompleteBase64(record: SysTaskRecord, base64Data: string, mimeType: string) {
  const localPath = await saveBase64Image(base64Data, mimeType, 'images')
  await generateImageThumb(localPath)

  await db.update(schema.sysTask)
    .set({ localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(eq(schema.sysTask.id, record.id))

  logTaskSuccess('ImageTask', 'saved-base64', { id: record.id, provider: record.provider, mimeType, localPath })

  await writeBackImageAssets(record, localPath)
}

// Setelah gambar selesai, tulis kembali ke tabel bisnis: storyboard (berdasarkan frameType), karakter, adegan, properti, sampul proyek
async function writeBackImageAssets(record: SysTaskRecord, localPath: string) {
  const params = parseTaskParams(record.params)
  if (record.storyboardId) {
    const sbUpdate: Record<string, any> = { updatedAt: now() }
    if (params.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
    else if (params.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
    else sbUpdate.composedImage = localPath
    await db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId))
  }
  if (params.coverDramaId || (record.dramaId && !record.storyboardId && !record.characterId && !record.sceneId && !record.propId)) {
    const coverDramaId = params.coverDramaId || record.dramaId
    if (coverDramaId) {
      await db.update(schema.dramas)
        .set({ thumbnail: localPath, updatedAt: now() })
        .where(eq(schema.dramas.id, coverDramaId))
    }
  }
  if (record.characterId) {
    await db.update(schema.characters).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId))
  }
  if (record.sceneId) {
    await db.update(schema.scenes).set({ imageUrl: localPath, status: 'completed', updatedAt: now() }).where(eq(schema.scenes.id, record.sceneId))
  }
  if (record.propId) {
    await db.update(schema.props).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.props.id, record.propId))
  }
}

async function handleVideoComplete(record: SysTaskRecord, videoUrl: string, duration: number | null | undefined, headers?: Record<string, string>) {
  // Provider (Gemini Veo) dapat mengembalikan video sebagai data URL base64
  const dataMatch = videoUrl.match(/^data:video\/([\w+.-]+);base64,(.+)$/)
  const localPath = dataMatch
    ? await saveBase64Image(dataMatch[2], `video/${dataMatch[1]}`, 'videos')
    : await downloadFile(videoUrl, 'videos', headers)
  // Frame poster untuk tampilan daftar/sampul, menghindari frontend harus buffer seluruh video untuk menampilkan frame pertama
  await extractVideoPoster(localPath)
  await db.update(schema.sysTask)
    .set({ resultUrl: videoUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(eq(schema.sysTask.id, record.id))

  logTaskSuccess('VideoTask', 'downloaded', { id: record.id, localPath, storyboardId: record.storyboardId, duration })

  if (record.storyboardId) {
    await db.update(schema.storyboards)
      .set({ videoUrl: localPath, duration: duration || undefined, updatedAt: now() })
      .where(eq(schema.storyboards.id, record.storyboardId))
  }
}

// ─── Normalisasi materi referensi ───────────────────────────────────────────────

async function normalizeReferenceImages(refs: string[] | null | undefined): Promise<string[]> {
  if (!Array.isArray(refs) || !refs.length) return []

  const deduped = Array.from(
    new Set(
      refs
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )

  const normalized = await Promise.all(deduped.map(async (value) => {
    if (value.startsWith('data:image/')) return value
    if (value.startsWith('static/') || value.startsWith('/static/')) {
      const localPath = value.startsWith('/static/') ? value.slice(1) : value
      try {
        return await readImageAsCompressedDataUrl(localPath, {
          maxWidth: 768,
          maxHeight: 768,
          quality: 68,
        })
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
        return null
      }
    }
    // URL remote: mengunduh dan mengompresi menjadi data URL, memastikan dapat digunakan untuk upload multipart (OpenAI edits) / inline_data (Gemini)
    if (/^https?:\/\//.test(value)) {
      try {
        return await fetchImageAsCompressedDataUrl(value, {
          maxWidth: 768,
          maxHeight: 768,
          quality: 68,
        })
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-fetch-failed', { url: value, error: (err as Error).message })
        return null
      }
    }
    return value
  }))

  return normalized.filter((item): item is string => !!item).slice(0, 6)
}

async function normalizeVideoReferenceUrl(value: string | null | undefined): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const localPath = raw.startsWith('/static/') ? raw.slice(1) : raw
    try {
      return await readImageAsCompressedDataUrl(localPath, {
        maxWidth: 768,
        maxHeight: 768,
        quality: 68,
      })
    } catch (err) {
      logTaskWarn('VideoTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
      return null
    }
  }
  return raw
}

async function normalizeVideoReferenceUrls(refs: string[] | null | undefined): Promise<string[]> {
  if (!Array.isArray(refs) || !refs.length) return []
  const normalized = await Promise.all(
    Array.from(new Set(refs.map((item) => String(item || '').trim()).filter(Boolean))).map((item) => normalizeVideoReferenceUrl(item)),
  )
  return normalized.filter((item): item is string => !!item)
}

/**
 * Mengurai video/audio referensi menjadi URL yang dapat diakses oleh Seedance API.
 * http(s)/dataURL langsung dilewati; path static lokal perlu PUBLIC_BASE_URL untuk membentuk alamat publik,
 * jika tidak dikonfigurasi akan melempar error yang dapat ditindaklanjuti (masuk ke catch dan ditulis ke error_msg untuk ditampilkan frontend).
 */
function resolvePublicMediaUrl(value: string | null | undefined, kind: 'video' | 'audio' | 'file'): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
    if (!base) {
      const label = kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'file'
      throw new Error(
        `Referensi ${label} adalah path lokal ${raw}, tetapi backend belum mengkonfigurasi PUBLIC_BASE_URL, API generasi video hulu tidak dapat mengakses alamat jaringan internal.` +
        `Silakan konfigurasi PUBLIC_BASE_URL di backend/.env (seperti https://your-domain.com) lalu coba lagi, atau gunakan URL publik.`,
      )
    }
    const p = raw.startsWith('/') ? raw : `/${raw}`
    return `${base}${p}`
  }
  return raw
}

function resolvePublicMediaUrls(refs: string[] | null | undefined, kind: 'video' | 'audio'): string[] {
  if (!Array.isArray(refs) || !refs.length) return []
  const items = Array.from(new Set(refs.map((item) => String(item || '').trim()).filter(Boolean)))
  return items.map((item) => resolvePublicMediaUrl(item, kind)).filter((item): item is string => !!item)
}

function normalizeStoredVideoResolution(resolution: string | null | undefined): string | undefined {
  const value = String(resolution || '').trim().toLowerCase()
  if (value === '480p' || value === '720p' || value === '1080p') return value
  if (value === '2k') return '2K'
  return undefined
}

/**
 * Header unduhan untuk penyedia Gemini (Veo): URI video `https://generativelanguage.googleapis.com/v1beta/files/...:download`
 * mewajibkan header API key untuk mengunduh; provider lain tidak perlu header khusus.
 */
function geminiDownloadHeaders(config: AIConfig): Record<string, string> | undefined {
  if (config.provider !== 'gemini' || !config.apiKey) return undefined
  return { 'x-goog-api-key': config.apiKey }
}
