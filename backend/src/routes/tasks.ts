import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest } from '../utils/response.js'
import { generateImage, generateVideo } from '../services/generation.js'
import { getActiveConfig, getConfigById } from '../services/ai.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { translateApiError } from '../utils/error-translate.js'
import {
  assertDramaAccess,
  assertStoryboardAccess,
  assertSceneAccess,
  assertCharacterAccess,
  assertPropAccess,
  assertTaskAccess,
  filterTasksByOwnership,
} from '../services/ownership.js'

const app = new Hono()

type TaskType = 'image' | 'video'

const WAN_MEDIA_TYPES = new Set([
  'first_frame',
  'last_frame',
  'reference_image',
  'reference_video',
  'reference_audio',
  'file',
  'link',
])

/**
 * Kompatibel dengan parameter input datar asli proyek, juga mendukung struktur model/input/parameters resmi Wan 3.0.
 */
function normalizeVideoRequest(body: any) {
  const input = body.input && typeof body.input === 'object' && !Array.isArray(body.input) ? body.input : {}
  const parameters = body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
    ? body.parameters
    : {}
  const media = Array.isArray(input.media) ? input.media : []

  const mediaUrls = (type: string) => media
    .filter((item: any) => item?.type === type)
    .map((item: any) => item?.url)

  return {
    ...body,
    prompt: body.prompt ?? input.prompt ?? '',
    reference_image_urls: body.reference_image_urls ?? mediaUrls('reference_image'),
    reference_video_urls: body.reference_video_urls ?? mediaUrls('reference_video'),
    reference_audio_urls: body.reference_audio_urls ?? mediaUrls('reference_audio'),
    first_frame_url: body.first_frame_url ?? mediaUrls('first_frame')[0],
    last_frame_url: body.last_frame_url ?? mediaUrls('last_frame')[0],
    file_url: body.file_url ?? mediaUrls('file')[0],
    link_url: body.link_url ?? mediaUrls('link')[0],
    generate_audio: body.generate_audio ?? parameters.audio,
    duration: body.duration ?? parameters.duration,
    aspect_ratio: body.aspect_ratio ?? parameters.ratio,
    resolution: body.resolution ?? parameters.resolution,
    seed: body.seed ?? parameters.seed,
    prompt_extend: body.prompt_extend ?? parameters.prompt_extend,
    watermark: body.watermark ?? parameters.watermark,
    official_media: media,
  }
}

function validateVideoRequest(body: any, provider?: string): string | null {
  for (const key of ['reference_image_urls', 'reference_video_urls', 'reference_audio_urls']) {
    if (body[key] !== undefined && !Array.isArray(body[key])) return `${key} harus berupa array`
    if (Array.isArray(body[key]) && body[key].some((url: any) => typeof url !== 'string' || !url.trim())) {
      return `${key} harus berisi URL berupa string tidak kosong`
    }
  }

  if (body.official_media.length) {
    for (const item of body.official_media) {
      if (!item || typeof item !== 'object' || !WAN_MEDIA_TYPES.has(item.type) || typeof item.url !== 'string' || !item.url.trim()) {
        return 'Setiap item input.media harus memiliki type dan url yang valid (bukan string kosong)'
      }
    }
    for (const type of ['first_frame', 'last_frame', 'file', 'link']) {
      if (body.official_media.filter((item: any) => item.type === type).length > 1) {
        return `Wan 3.0, ${type} di input.media maksimal 1 item`
      }
    }
  }

  const imgs = body.reference_image_urls.length
  const vids = body.reference_video_urls.length
  const auds = body.reference_audio_urls.length
  const first = Boolean(body.first_frame_url)
  const last = Boolean(body.last_frame_url)
  const file = Boolean(body.file_url)
  const link = Boolean(body.link_url)

  if ((provider || '').toLowerCase() === 'aliyun') {
    if (imgs > 10 || vids > 5 || auds > 5) return 'Wan 3.0 batas media referensi terlampaui: gambar≤10, video≤5, audio≤5'
    if (last && !first) return 'Wan 3.0 frame terakhir harus dikirim bersama frame awal'
    if (file && link) return 'Wan 3.0 file dan link tidak boleh dikirim bersamaan'
    if ((first || last) && (imgs + vids + auds > 0 || file || link)) {
      return 'Wan 3.0 first_frame/last_frame tidak boleh dicampur dengan reference_image/reference_video/reference_audio/file/link'
    }
    const total = imgs + vids + auds + Number(first) + Number(last) + Number(file) + Number(link)
    if (total > 20) return 'Wan 3.0 input.media maksimal 20 item'
  } else {
    if (imgs > 9 || vids > 3 || auds > 3) return 'Batas media referensi terlampaui: gambar≤9, video≤3, audio≤3'
    if (auds > 0 && imgs + vids === 0) return 'Audio referensi membutuhkan minimal 1 gambar atau video referensi'
  }

  if (!String(body.prompt || '').trim() && imgs + vids + auds === 0 && !first && !last && !file && !link) {
    return 'Pembuatan video membutuhkan minimal satu media referensi atau prompt'
  }
  return null
}

// POST /tasks — memulai tugas pembuatan (body.type: image | video)
app.post('/', async (c) => {
  const body = await c.req.json()
  const type = body.type as TaskType
  if (type !== 'image' && type !== 'video') return badRequest(c, 'type harus image atau video')

  // Tegakkan pemilikan drama sebelum membuat tugas
  if (body.storyboard_id != null) await assertStoryboardAccess(c, Number(body.storyboard_id))
  else if (body.scene_id != null) await assertSceneAccess(c, Number(body.scene_id))
  else if (body.character_id != null) await assertCharacterAccess(c, Number(body.character_id))
  else if (body.prop_id != null) await assertPropAccess(c, Number(body.prop_id))
  else if (body.drama_id != null) await assertDramaAccess(c, Number(body.drama_id))

  if (type === 'image') {
    if (!body.prompt) return badRequest(c, 'Prompt wajib diisi')
  }

  const videoBody = type === 'video' ? normalizeVideoRequest(body) : null

  try {
    // Permintaan dengan config_id yang ditentukan secara eksplisit (dropdown model workstation berpindah lintas vendor) diprioritaskan;
    // Jika tidak ditentukan, baru fallback ke konfigurasi terkunci episode, untuk menghindari ketidakcocokan antara konfigurasi terkunci dan model yang dipilih (misalnya mengunci Seedance tetapi mengirim nama model MiniMax)
    let configId: number | undefined = body.config_id
    let episodeResolution: string | undefined
    let storyboardDramaId: number | undefined
    if (body.storyboard_id) {
      const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id)))
      if (sb) {
        const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId))
        const locked = type === 'image' ? ep?.imageConfigId : ep?.videoConfigId
        if (locked != null && configId == null) configId = locked
        if (type === 'video' && ep?.resolution) episodeResolution = ep.resolution
        storyboardDramaId = ep?.dramaId ?? undefined
      }
    }

    if (type === 'video' && videoBody) {
      const effectiveConfig = configId
        ? (await getConfigById(configId)) ?? await getActiveConfig('video')
        : await getActiveConfig('video')
      const validationError = validateVideoRequest(videoBody, effectiveConfig?.provider)
      if (validationError) return badRequest(c, validationError)
    }

    logTaskStart('TaskAPI', 'generate', {
      type,
      storyboardId: body.storyboard_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      dramaId: body.drama_id,
    })
    logTaskPayload('TaskAPI', 'request body', body)

    // Saat pembuatan video, kata gaya visual proyek disuntikkan ke bagian depan prompt (konsisten dengan injeksi otomatis di sisi gambar)
    let videoPrompt = videoBody?.prompt
    if (type === 'video' && String(videoPrompt || '').trim()) {
      const dramaId = body.drama_id ?? storyboardDramaId ?? null
      const stylePrompt = await getDramaStylePrompt(dramaId)
      if (stylePrompt) videoPrompt = `${stylePrompt}，\n${videoPrompt}`
    }

    const id = type === 'image'
      ? await generateImage({
        storyboardId: body.storyboard_id,
        dramaId: body.drama_id,
        sceneId: body.scene_id,
        characterId: body.character_id,
        prompt: body.prompt,
        model: body.model,
        size: body.size,
        referenceImages: body.reference_images,
        frameType: body.frame_type,
        configId,
      })
      : await generateVideo({
        storyboardId: body.storyboard_id,
        dramaId: body.drama_id,
        prompt: videoPrompt,
        model: videoBody!.model,
        referenceMode: 'reference',
        imageUrl: videoBody!.image_url,
        firstFrameUrl: videoBody!.first_frame_url,
        lastFrameUrl: videoBody!.last_frame_url,
        referenceImageUrls: videoBody!.reference_image_urls,
        referenceVideoUrls: videoBody!.reference_video_urls,
        referenceAudioUrls: videoBody!.reference_audio_urls,
        referenceFileUrl: videoBody!.file_url,
        referenceLinkUrl: videoBody!.link_url,
        generateAudio: videoBody!.generate_audio,
        duration: videoBody!.duration,
        aspectRatio: videoBody!.aspect_ratio,
        resolution: episodeResolution || videoBody!.resolution,
        seed: videoBody!.seed,
        promptExtend: videoBody!.prompt_extend,
        watermark: videoBody!.watermark,
        configId,
      })

    const [record] = await db.select().from(schema.sysTask)
      .where(eq(schema.sysTask.id, id))
    logTaskSuccess('TaskAPI', 'generate', { taskId: id, type, provider: record?.provider })
    const recOut: any = { ...record }
    if (recOut.errorMsg) recOut.errorMsg = translateApiError(recOut.errorMsg)
    return created(c, recOut)
  } catch (err: any) {
    logTaskError('TaskAPI', 'generate', { type, error: err.message })
    return badRequest(c, translateApiError(err.message))
  }
})

// GET /tasks/:id — poll status tugas
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await assertTaskAccess(c, id)
  const [row] = await db.select().from(schema.sysTask)
    .where(eq(schema.sysTask.id, id))
  if (row && row.errorMsg) row.errorMsg = translateApiError(row.errorMsg)
  return success(c, row || null)
})

// GET /tasks — filter berdasarkan type / storyboard_id / drama_id
app.get('/', async (c) => {
  const type = c.req.query('type')
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')

  let rows = await db.select().from(schema.sysTask)

  if (type) rows = rows.filter(r => r.type === type)
  if (storyboardId) rows = rows.filter(r => r.storyboardId === Number(storyboardId))
  if (dramaId) rows = rows.filter(r => r.dramaId === Number(dramaId))

  rows = await filterTasksByOwnership(c, rows)

  rows.forEach(r => {
    if (r.errorMsg) r.errorMsg = translateApiError(r.errorMsg)
  })
  return success(c, rows)
})

// DELETE /tasks/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await assertTaskAccess(c, id)
  await db.delete(schema.sysTask).where(eq(schema.sysTask.id, id))
  return success(c)
})

export default app
