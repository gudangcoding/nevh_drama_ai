/**
 * Orkestrator produksi otomatis lintas-episode:
 *   scripts → assets → asset_images → storyboards → composed_images → waiting_approval → videos → merging
 *
 * Desain:
 * - Setiap fase bersifat idempoten & dapat dilanjutkan: menghitung ulang pekerjaan yang tersisa dari database,
 *   sehingga proses backend restart / lanjutkan kembali tidak akan mengulang kerja yang sudah selesai.
 * - Status job: running | waiting_approval | completed | failed | cancelled | interrupted.
 * - Fase "videos" hanya dijalankan setelah pengguna menyetujui alur cerita & adegan (manual approval gate).
 * - Konkurensi: 2 paralel untuk tugas generasi gambar/video; ekstraksi dan agent dijalankan serial.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { startExtraction, getExtractionStatus, EXTRACT_TARGETS, type ExtractTarget } from './extraction.js'
import { startVideoPromptBatch, getVideoPromptBatchStatus } from './video-prompts.js'
import { ensureBatchFinalPrompts } from './final-prompt.js'
import { generateImage, generateVideo } from './generation.js'
import { mergeEpisodeVideos } from './ffmpeg-merge.js'
import { getActiveConfig, getActiveConfigId } from './ai.js'
import { getContentLanguage } from './app-settings.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { agentAbortSignal, isAgentTimeoutAbort } from '../utils/agent-timeout.js'
import { translateApiError, describeApiError } from '../utils/error-translate.js'

export type ProductionPhase =
  | 'scripts'
  | 'assets'
  | 'asset_images'
  | 'storyboards'
  | 'composed_images'
  | 'waiting_approval'
  | 'videos'
  | 'merging'

export type ProductionStatus = 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

export interface ProductionJobConfig {
  text_config_id?: number | null
  text_model?: string | null
  image_config_id?: number | null
  video_config_id?: number | null
  episode_resolution?: string | null
  /** Buat video otomatis tanpa menunggu persetujuan manual setelah gambar komposisi selesai */
  auto_video?: boolean
}

type ProductionJobRow = typeof schema.productionJobs.$inferSelect
type DramaRow = typeof schema.dramas.$inferSelect
type EpisodeRow = typeof schema.episodes.$inferSelect

/** Sinyal berhenti: status job sudah diubah oleh aksi pengguna (batal/hapus) — bukan kegagalan */
class JobStopped extends Error {
  constructor(public readonly status?: string) {
    super('Job stopped')
  }
}

/** Guard runtime menjalankan job yang sama (mencegah duplikasi eksekutor via approve/resume ganda) */
const runningJobs = new Set<number>()

// ─── Antrian produksi global ────────────────────────────────────────────────────
// Semua job produksi (start/approve/resume) dijalankan berurutan satu per satu,
// agar puluhan drama tidak memicu puluhan agent/gambar/video sekaligus (sumber
// utama timeout "Batas waktu pembuatan terlampaui"). runJob tidak pernah melempar
// (semua fase sudah menangkap error), jadi satu job gagal tidak memblokir berikutnya.
let queueTail: Promise<void> = Promise.resolve()

function enqueueRun(jobId: number): void {
  queueTail = queueTail.then(() => runJob(jobId)).catch(() => {})
  logTaskProgress('Production', 'queued', { jobId })
}

const TERMINAL = new Set<ProductionStatus>(['completed', 'failed', 'cancelled'])

// ─── Helper dasar ───────────────────────────────────────────────────────────────

function parseJobConfig(job: ProductionJobRow): ProductionJobConfig {
  try {
    return job.config ? (JSON.parse(job.config) as ProductionJobConfig) : {}
  } catch {
    return {}
  }
}

async function getJobById(id: number): Promise<ProductionJobRow | null> {
  const rows = await db.select().from(schema.productionJobs).where(eq(schema.productionJobs.id, id))
  return rows[0] || null
}

async function getLatestJob(dramaId: number): Promise<ProductionJobRow | null> {
  const rows = await db.select().from(schema.productionJobs)
    .where(eq(schema.productionJobs.dramaId, dramaId))
    .orderBy(schema.productionJobs.id)
  return rows[rows.length - 1] || null
}

function setStage(jobId: number, detail: string | null) {
  void db.update(schema.productionJobs)
    .set({ stageDetail: detail, updatedAt: now() })
    .where(eq(schema.productionJobs.id, jobId))
}

/** Melempar JobStopped saat status job tidak lagi running (setelah dibatalkan/dialihkan) */
async function ensureActive(jobId: number): Promise<void> {
  const job = await getJobById(jobId)
  if (!job || job.status !== 'running') throw new JobStopped(job?.status)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function mapLimit<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let index = 0
  const runner = async () => {
    while (index < items.length) {
      const i = index++
      await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()))
}

/**
 * Jalankan worker per item dengan batas konkurensi, kumpulkan error per item tanpa
 * mematikan seluruh fase. Satu shot gagal (timeout/API reject) TIDAK membatalkan
 * shot lain yang masih antre — hasil yang berhasil tetap tersimpan, sisanya mudah
 * dilanjutkan via resume tanpa mengulang pekerjaan yang sudah selesai.
 */
async function collectPhaseErrors<T>(items: T[], jobId: number, worker: (item: T, index: number) => Promise<void>): Promise<string[]> {
  const errors: string[] = []
  await mapLimit(items, 2, async (item, index) => {
    try {
      await worker(item, index)
    } catch (err: any) {
      // Pembatalan job bukan error produksi — langsung dihentikan
      if (err instanceof JobStopped) throw err
      errors.push(String(err?.message || err))
      logTaskWarn('Production', 'phase-item-failed', { jobId, error: String(err?.message || err), index })
    }
  })
  return errors
}

async function waitTaskDone(taskId: number, jobId: number): Promise<void> {
  for (;;) {
    await ensureActive(jobId)
    const rows = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, taskId))
    const task = rows[0]
    if (!task) throw new Error('Tugas generasi tidak ditemukan')
    if (task.status === 'completed') return
    if (task.status === 'failed') throw new Error(translateApiError(task.errorMsg || 'Tugas generasi gagal'))
    await sleep(5000)
  }
}

async function waitMerge(episodeId: number, jobId: number): Promise<void> {
  for (;;) {
    await ensureActive(jobId)
    const rows = await db.select().from(schema.videoMerges)
      .where(eq(schema.videoMerges.episodeId, episodeId))
      .orderBy(schema.videoMerges.id)
    const merge = rows[rows.length - 1]
    if (merge?.status === 'completed') return
    if (merge?.status === 'failed') throw new Error(translateApiError(merge.errorMsg || 'Penggabungan video gagal'))
    await sleep(3000)
  }
}

async function checkTextConfig(): Promise<void> {
  const config = await getActiveConfig('text')
  if (!config) {
    throw new Error('Model teks belum dikonfigurasi, silakan tambah dan aktifkan layanan AI di halaman "Pengaturan"')
  }
}

/**
 * Kesalahan sementara (jaringan/5xx/timeout) — pantas di-retry sekali-dua kali agar
 * produksi tidak mati karena provider tiba-tiba sibuk. Kesalahan pasti (saldo habis,
 * kunci API salah, model tidak ada) tidak di-retry agar TIDAK menghabiskan token.
 */
function isTransientError(err: unknown): boolean {
  const raw = String((err as any)?.message || (err as any)?.cause?.message || err || '')
  return /timeout|timed\s?out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|fetch failed|network error|broken pipe|502|503|504|5\d\d/i.test(raw)
}

const AGENT_RETRY_LIMIT = Number(process.env.AI_AGENT_RETRY || 2)
const AGENT_RETRY_BACKOFF_MS = Number(process.env.AI_AGENT_RETRY_BACKOFF || 4000)

async function runAgentSilent(agentType: string, jobId: number, episode: EpisodeRow, drama: DramaRow, config: ProductionJobConfig, message: string, maxSteps = 20): Promise<void> {
  const agent = mastra.getAgent(agentType)
  if (!agent) throw new Error(`Agent ${agentType} tidak tersedia`)
  const requestContext = buildAgentRequestContext({
    episodeId: episode.id,
    dramaId: drama.id,
    modelOverride: config.text_model || undefined,
    textConfigId: config.text_config_id || undefined,
    language: getContentLanguage(),
  })

  let attempt = 0
  for (;;) {
    try {
      await agent.generate([{ role: 'user', content: message }], { maxSteps, requestContext, abortSignal: agentAbortSignal(maxSteps) })
      return
    } catch (err: any) {
      // Abort karena timeout adalah milik kita sendiri: mengulang dari langkah ke-0
      // hanya membakar token → langsung gagal, dilanjutkan via resume job.
      if (isAgentTimeoutAbort(err) || !isTransientError(err) || attempt >= AGENT_RETRY_LIMIT) throw err
      attempt++
      logTaskWarn('Production', 'agent-retry', {
        jobId,
        agentType,
        episodeNumber: episode.episodeNumber,
        attempt,
        maxAttempts: AGENT_RETRY_LIMIT,
        error: String(err?.message || err),
      })
      await sleep(AGENT_RETRY_BACKOFF_MS * attempt)
    }
  }
}

// ─── Fase: scripts ─────────────────────────────────────────────────────────────

async function doScripts(jobId: number, job: ProductionJobRow, drama: DramaRow, config: ProductionJobConfig) {
  await checkTextConfig()

  // Pastikan N episode tersedia (resume = cukup isi yang kurang)
  const ts = now()
  const existing = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, job.dramaId), isNull(schema.episodes.deletedAt)))
  const have = new Set(existing.map(e => e.episodeNumber))
  for (let n = 1; n <= job.totalEpisodes; n++) {
    if (!have.has(n)) {
      const imageConfigId = config.image_config_id ?? await getActiveConfigId('image')
      const videoConfigId = config.video_config_id ?? await getActiveConfigId('video')
      await db.insert(schema.episodes).values({
        dramaId: job.dramaId,
        episodeNumber: n,
        title: `Episode ${n}`,
        imageConfigId,
        videoConfigId,
        resolution: config.episode_resolution || '720p',
        status: 'draft',
        createdAt: ts,
        updatedAt: ts,
      })
    }
  }

  // Per-episode: perluas alur (content) → tulis ulang jadi skrip terformat (scriptContent)
  const episodes = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, job.dramaId), isNull(schema.episodes.deletedAt)))
    .orderBy(schema.episodes.episodeNumber)

  for (const ep of episodes) {
    await ensureActive(jobId)
    setStage(jobId, `Menulis alur cerita — Episode ${ep.episodeNumber}/${job.totalEpisodes}`)

    if (!(ep.content || '').trim()) {
      const ctxMessage =
        `Tulis alur cerita untuk Episode ${ep.episodeNumber} dari ${job.totalEpisodes} episode drama "${drama.title}". ` +
        `Panggil read_synopsis_context terlebih dahulu untuk membaca sinopsis dan ringkasan episode sebelumnya, lalu simpan dengan save_episode_content. Bahasa konten: ${getContentLanguage()}.`
      await runAgentSilent('episode_expander', jobId, ep, drama, config, ctxMessage, 12)
    }

    await ensureActive(jobId)
    const [fresh] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, ep.id))
    if (!(fresh?.content || '').trim()) throw new Error(`Alur cerita Episode ${ep.episodeNumber} kosong setelah diproses Agent`)

    setStage(jobId, `Menulis ulang skrip — Episode ${ep.episodeNumber}/${job.totalEpisodes}`)
    if (!(fresh.scriptContent || '').trim()) {
      await runAgentSilent('script_rewriter', jobId, ep, drama, config, 'Baca skrip episode ini, tulis ulang menjadi skrip berformat, lalu simpan', 20)
    }
    await ensureActive(jobId)
    const [again] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, ep.id))
    if (!(again?.scriptContent || '').trim()) throw new Error(`Skrip Episode ${ep.episodeNumber} kosong setelah ditulis ulang`)
  }
}

// ─── Fase: assets (ekstraksi karakter/adegan/properti) ─────────────────────────

async function doAssets(jobId: number, job: ProductionJobRow, config: ProductionJobConfig) {
  await checkTextConfig()
  const episodes = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, job.dramaId), isNull(schema.episodes.deletedAt)))
    .orderBy(schema.episodes.episodeNumber)

  for (const ep of episodes) {
    for (const target of EXTRACT_TARGETS) {
      await ensureActive(jobId)
      setStage(jobId, `Ekstraksi ${targetLabel(target)} — Episode ${ep.episodeNumber}`)
      if (!startExtraction(ep.id, ep.dramaId, target, { model: config.text_model || undefined, configId: config.text_config_id || undefined })) {
        // Tugas lain sedang berjalan untuk pasangan yang sama — tunggu hingga selesai
      }
      for (;;) {
        await ensureActive(jobId)
        const st = getExtractionStatus(ep.id)[target]
        if (!st) break
        if (st.status === 'error') throw new Error(translateApiError(st.error || 'Ekstraksi gagal'))
        if (st.status === 'done') break
        await sleep(5000)
      }
    }
  }
}

function targetLabel(target: ExtractTarget): string {
  if (target === 'characters') return 'karakter'
  if (target === 'scenes') return 'adegan'
  return 'properti'
}

// ─── Fase: asset_images (gambar aset) ──────────────────────────────────────────

interface AssetImageItem {
  kind: 'character' | 'scene' | 'prop'
  id: number
  label: string
  /** Prompt akhir dari Agent (batch) — dipakai bila terisi */
  finalPrompt: string
  /** Prompt lokal darurat bila prompt akhir kosong */
  defaultPrompt: string
}

async function doAssetImages(jobId: number, job: ProductionJobRow, config: ProductionJobConfig) {
  const dramaId = job.dramaId
  const characters = await db.select().from(schema.characters).where(and(eq(schema.characters.dramaId, dramaId), isNull(schema.characters.deletedAt)))
  const scenes = await db.select().from(schema.scenes).where(and(eq(schema.scenes.dramaId, dramaId), isNull(schema.scenes.deletedAt)))
  const props = await db.select().from(schema.props).where(and(eq(schema.props.dramaId, dramaId), isNull(schema.props.deletedAt)))

  const firstEp = (await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    .orderBy(schema.episodes.episodeNumber))[0]

  if (firstEp) {
    // Prompt akhir aset dibuat BATCH dalam satu sesi Agent (bukan satu sesi per aset),
    // agar tidak membakar token & waktu untuk belasan aset yang hanya butuh prompt singkat.
    await ensureBatchFinalPrompts(firstEp.id, dramaId, [
      ...characters.map(c => ({ character: c })),
      ...scenes.map(s => ({ scene: s })),
      ...props.map(p => ({ prop: p })),
    ], { model: config.text_model || undefined, configId: config.text_config_id || undefined })

    // Muat ulang setelah Agent menyimpan final_prompt, lalu susun item yang belum punya gambar
    const freshChars = await db.select().from(schema.characters).where(and(eq(schema.characters.dramaId, dramaId), isNull(schema.characters.deletedAt)))
    const freshScenes = await db.select().from(schema.scenes).where(and(eq(schema.scenes.dramaId, dramaId), isNull(schema.scenes.deletedAt)))
    const freshProps = await db.select().from(schema.props).where(and(eq(schema.props.dramaId, dramaId), isNull(schema.props.deletedAt)))

    const items: AssetImageItem[] = [
      ...freshChars.filter(c => !c.imageUrl).map(c => ({
        kind: 'character' as const,
        id: c.id,
        label: `Karakter: ${c.name}`,
        defaultPrompt: `${c.name} ${c.appearance || ''} ${c.styling || ''} 16:9 horizontal character turnaround sheet, half-body character poster, front view, white background`.trim() || `Buat gambar untuk Karakter: ${c.name}`,
        finalPrompt: c.finalPrompt || '',
      })),
      ...freshScenes.filter(s => !s.imageUrl).map(s => ({
        kind: 'scene' as const,
        id: s.id,
        label: `Adegan: ${s.location}`,
        defaultPrompt: `${s.prompt || ''} ${s.lighting || ''}`.trim() || `Buat gambar untuk Adegan: ${s.location}`,
        finalPrompt: s.finalPrompt || '',
      })),
      ...freshProps.filter(p => !p.imageUrl).map(p => ({
        kind: 'prop' as const,
        id: p.id,
        label: `Properti: ${p.name}`,
        defaultPrompt: `${p.name} ${p.description || ''} single product photo on pure white background`.trim() || `Buat gambar untuk Properti: ${p.name}`,
        finalPrompt: p.finalPrompt || '',
      })),
    ]

    let done = 0
    const total = items.length
    const errors = await collectPhaseErrors(items, jobId, async (item) => {
      done++
      await ensureActive(jobId)
      setStage(jobId, `Buat gambar ${item.label} (${done}/${total})`)
      const prompt = item.finalPrompt?.trim() || item.defaultPrompt
      await ensureActive(jobId)
      const taskId = await generateImage({
        characterId: item.kind === 'character' ? item.id : undefined,
        sceneId: item.kind === 'scene' ? item.id : undefined,
        propId: item.kind === 'prop' ? item.id : undefined,
        dramaId,
        prompt,
        configId: config.image_config_id || undefined,
      })
      await waitTaskDone(taskId, jobId)
    })

    if (errors.length) {
      const detail = errors.length === total
        ? `Semua gambar aset gagal dibuat. ${errors[0]}`
        : `Sebagian gambar aset gagal dibuat (${errors.length}/${total}), dilanjutkan via resume. ${errors[0]}`
      throw new Error(detail)
    }
  } else if (characters.length || scenes.length || props.length) {
    throw new Error('Tidak ada episode untuk fase gambar aset (jalankan fase scripts terlebih dahulu)')
  }
}

// ─── Fase: storyboards (pecah adegan + prompt video) ───────────────────────────

async function doStoryboards(jobId: number, job: ProductionJobRow, config: ProductionJobConfig) {
  await checkTextConfig()
  const dramaId = job.dramaId

  const episodes = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    .orderBy(schema.episodes.episodeNumber)

  for (const ep of episodes) {
    await ensureActive(jobId)
    setStage(jobId, `Pecah storyboard — Episode ${ep.episodeNumber}`)

    // Konteks (skrip, karakter, adegan, properti) dibaca AGENT lewat tool
    // read_storyboard_context — jangan mengirim ulang daftar yang sama di pesan
    // (menghemat token di tiap langkah multi-langkah Agent).
    const message =
      `Urai skrip episode ini menjadi storyboard, dan untuk setiap segmen storyboard sekaligus buat video_prompt (prompt pembuatan video).\n` +
      `Model video saat ini: ${ep.videoConfigId ? (await configLabel('video', ep.videoConfigId)) : 'default'}, buat video_prompt sesuai karakteristik dan batasan durasi model tersebut.\n\n` +
      `Persyaratan binding:\n` +
      `- Setiap shot harus mengikat character_ids hanya dari daftar karakter pada read_storyboard_context (ID wajib dari daftar; karakter yang muncul pasti diikat, jangan ada yang terlewat)\n` +
      `- Setiap shot sebaiknya mengisi scene_id dari daftar adegan (ID wajib dari daftar), jangan menciptakan adegan baru dari imajinasi\n` +
      `- Jika ada properti kunci yang muncul di shot, ikat prop_ids dari daftar properti (ID wajib dari daftar); jika tidak ada kirim array kosong\n` +
      `- Hanya shot lingkungan kosong murni yang boleh tidak mengikat karakter`

    await runAgentSilent('storyboard_breaker', jobId, ep, { id: dramaId, title: '' } as DramaRow, config, message, 40)

    await ensureActive(jobId)
    setStage(jobId, `Lengkapi prompt video — Episode ${ep.episodeNumber}`)
    const started = await startVideoPromptBatch(ep.id, dramaId, { model: config.text_model || undefined, configId: config.text_config_id || undefined })
    if (started.started) {
      for (;;) {
        await ensureActive(jobId)
        const batch = getVideoPromptBatchStatus(ep.id)
        if (!batch) break
        if (batch.status === 'error') throw new Error(translateApiError(batch.error || 'Pembuatan prompt video gagal'))
        if (batch.status === 'done') break
        await sleep(5000)
      }
    }
  }
}

async function configLabel(serviceType: 'text' | 'image' | 'video', configId: number | null | undefined): Promise<string> {
  if (!configId) return 'default'
  const { getConfigById } = await import('./ai.js')
  const cfg = await getConfigById(configId)
  return cfg ? `${cfg.provider} · ${cfg.model}` : 'default'
}

// ─── Fase: composed_images (gambar komposisi tiap shot) ────────────────────────

async function doComposedImages(jobId: number, job: ProductionJobRow, config: ProductionJobConfig) {
  const dramaId = job.dramaId
  const episodes = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    .orderBy(schema.episodes.episodeNumber)

  let done = 0
  const tasks: { sb: typeof schema.storyboards.$inferSelect; ep: EpisodeRow }[] = []
  for (const ep of episodes) {
    const sbs = await db.select().from(schema.storyboards)
      .where(and(eq(schema.storyboards.episodeId, ep.id), isNull(schema.storyboards.deletedAt)))
    for (const sb of sbs) if (!sb.composedImage) tasks.push({ sb, ep })
  }
  const total = tasks.length

  const errors = await collectPhaseErrors(tasks, jobId, async ({ sb, ep }) => {
    done++
    await ensureActive(jobId)
    setStage(jobId, `Buat gambar komposisi S${sb.storyboardNumber} — Episode ${ep.episodeNumber} (${done}/${total})`)
    const prompt = (sb.imagePrompt || sb.description || '').trim()
    if (!prompt) throw new Error(`Storyboard S${sb.storyboardNumber} tidak memiliki deskripsi gambar untuk dikomposisikan`)
    await ensureActive(jobId)
    const taskId = await generateImage({
      storyboardId: sb.id,
      dramaId,
      prompt,
      configId: config.image_config_id || undefined,
    })
    await waitTaskDone(taskId, jobId)
  })

  if (errors.length) {
    const detail = errors.length === total
      ? `Semua gambar komposisi gagal dibuat. ${errors[0]}`
      : `Sebagian gambar komposisi gagal dibuat (${errors.length}/${total}), dilanjutkan via resume. ${errors[0]}`
    throw new Error(detail)
  }
}

// ─── Fase: videos (generasi video — setelah persetujuan) ───────────────────────

async function doVideos(jobId: number, job: ProductionJobRow, config: ProductionJobConfig) {
  const dramaId = job.dramaId
  const episodes = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    .orderBy(schema.episodes.episodeNumber)

  let done = 0
  const tasks: { sb: typeof schema.storyboards.$inferSelect; ep: EpisodeRow }[] = []
  for (const ep of episodes) {
    const sbs = await db.select().from(schema.storyboards)
      .where(and(eq(schema.storyboards.episodeId, ep.id), isNull(schema.storyboards.deletedAt)))
    for (const sb of sbs) {
      const emptyPrompt = !(sb.videoPrompt || '').trim()
      const hasVideo = !!(sb.videoUrl || sb.composedVideoUrl)
      if (!hasVideo) {
        if (emptyPrompt) {
          logTaskProgress('Production', 'skip-video-no-prompt', { jobId, storyboardId: sb.id })
          continue
        }
        tasks.push({ sb, ep })
      }
    }
  }
  const total = tasks.length

  const errors = await collectPhaseErrors(tasks, jobId, async ({ sb, ep }) => {
    done++
    await ensureActive(jobId)
    setStage(jobId, `Buat video S${sb.storyboardNumber} — Episode ${ep.episodeNumber} (${done}/${total})`)
    const prompt = (sb.videoPrompt || '').trim()
    const referenceImageUrls = [sb.composedImage].filter((v): v is string => !!(v && String(v).trim()))
    const taskId = await generateVideo({
      storyboardId: sb.id,
      dramaId,
      prompt,
      referenceImageUrls,
      duration: sb.duration || 8,
      aspectRatio: ((await getDramaRow(dramaId) as DramaRow | null)?.aspectRatio) || '9:16',
      resolution: ep.resolution || '720p',
      configId: config.video_config_id || ep.videoConfigId || undefined,
    })
    await waitTaskDone(taskId, jobId)
  })

  if (errors.length) {
    const detail = errors.length === total
      ? `Semua video gagal dibuat. ${errors[0]}`
      : `Sebagian video gagal dibuat (${errors.length}/${total}), dilanjutkan via resume. ${errors[0]}`
    throw new Error(detail)
  }
}

async function getDramaRow(dramaId: number): Promise<DramaRow | null> {
  const rows = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  return rows[0] || null
}

// ─── Fase: merging ─────────────────────────────────────────────────────────────

async function doMerging(jobId: number, job: ProductionJobRow) {
  const episodes = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, job.dramaId), isNull(schema.episodes.deletedAt)))
    .orderBy(schema.episodes.episodeNumber)

  for (const ep of episodes) {
    await ensureActive(jobId)
    const merges = await db.select().from(schema.videoMerges)
      .where(eq(schema.videoMerges.episodeId, ep.id))
      .orderBy(schema.videoMerges.id)
    const last = merges[merges.length - 1]
    const done = last?.status === 'completed' && !!ep.videoUrl

    const sbs = await db.select().from(schema.storyboards)
      .where(and(eq(schema.storyboards.episodeId, ep.id), isNull(schema.storyboards.deletedAt)))
    const hasClips = sbs.some(sb => !!(sb.videoUrl || sb.composedVideoUrl))

    if (!done && hasClips) {
      setStage(jobId, `Gabungkan video — Episode ${ep.episodeNumber}`)
      const mergeId = await mergeEpisodeVideos(ep.id, ep.dramaId, undefined, { subtitles: true })
      logTaskStart('Production', 'merge-wait', { jobId, episodeId: ep.id, mergeId })
      await waitMerge(ep.id, jobId)
    }
  }
}

// ─── Loop eksekutor utama ──────────────────────────────────────────────────────

async function runJob(jobId: number): Promise<void> {
  if (runningJobs.has(jobId)) return
  runningJobs.add(jobId)
  try {
    for (;;) {
      const job = await getJobById(jobId)
      if (!job || job.status !== 'running' || job.phase === 'waiting_approval') return
      const config = parseJobConfig(job)
      let drama: DramaRow | null = await getDramaRow(job.dramaId)
      if (!drama) return

      try {
        switch (job.phase) {
          case 'scripts':
            await doScripts(jobId, job, drama, config)
            await advance(jobId, 'assets')
            break
          case 'assets':
            await doAssets(jobId, job, config)
            await advance(jobId, 'asset_images')
            break
          case 'asset_images':
            await doAssetImages(jobId, job, config)
            await advance(jobId, 'storyboards')
            break
          case 'storyboards':
            await doStoryboards(jobId, job, config)
            await advance(jobId, 'composed_images')
            break
          case 'composed_images':
            await doComposedImages(jobId, job, config)
            await ensureActive(jobId)
            if (config.auto_video) {
              // Mode "buat video langsung": tanpa gerbang persetujuan manual, lanjut ke pembuatan video
              setStage(jobId, 'Pembuatan video otomatis dimulai')
              await advance(jobId, 'videos')
              break
            }
            // Gerbang persetujuan manual: berhenti, menunggu pengguna memeriksa alur cerita & adegan
            await db.update(schema.productionJobs)
              .set({ phase: 'waiting_approval', status: 'waiting_approval', stageDetail: 'Menunggu persetujuan alur cerita & adegan', approvedAt: null, updatedAt: now() })
              .where(eq(schema.productionJobs.id, jobId))
            return
          case 'waiting_approval':
            return
          case 'videos':
            await doVideos(jobId, job, config)
            await advance(jobId, 'merging')
            break
          case 'merging':
            await doMerging(jobId, job)
            await ensureActive(jobId)
            await db.update(schema.productionJobs)
              .set({ status: 'completed', phase: 'merging', stageDetail: 'Produksi selesai', errorMsg: null, updatedAt: now() })
              .where(eq(schema.productionJobs.id, jobId))
            await db.update(schema.dramas).set({ status: 'completed', updatedAt: now() }).where(eq(schema.dramas.id, drama.id))
            return
          default:
            return
        }
      } catch (err: any) {
        if (err instanceof JobStopped) return
        // Boleh dilanjutkan kembali dari fase saat ini (pekerjaan yang sudah selesai akan dilewati)
        const message = describeApiError(err)
        logTaskError('Production', 'phase', { jobId, phase: job.phase, error: message })
        console.error(`[ProductionJob ${jobId}] ${job.phase} failed:`, err)
        await db.update(schema.productionJobs)
          .set({ status: 'failed', errorMsg: message, updatedAt: now() })
          .where(eq(schema.productionJobs.id, jobId))
        return
      }
    }
  } finally {
    runningJobs.delete(jobId)
  }
}

async function advance(jobId: number, next: ProductionPhase) {
  const job = await getJobById(jobId)
  if (!job) throw new JobStopped()
  if (job.status !== 'running') throw new JobStopped(job.status)
  await db.update(schema.productionJobs)
    .set({ phase: next, stageDetail: null, updatedAt: now() })
    .where(eq(schema.productionJobs.id, jobId))
}

// ─── API publik (route) ────────────────────────────────────────────────────────

export async function startProduction(dramaId: number, opts: ProductionJobConfig = {}): Promise<ProductionJobRow> {
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  if (!drama) throw new Error('Drama tidak ditemukan')
  if (!(drama.synopsis || '').trim()) {
    throw new Error('Tambahkan sinopsis terlebih dahulu sebelum memulai produksi otomatis')
  }
  if (!drama.totalEpisodes || drama.totalEpisodes < 1) {
    throw new Error('Jumlah episode tidak valid untuk produksi otomatis')
  }

  const existing = await getLatestJob(dramaId)
  if (existing && !TERMINAL.has(existing.status as ProductionStatus)) {
    throw new Error('Sudah ada job produksi yang sedang berjalan untuk drama ini')
  }

  const ts = now()
  const res = await db.insert(schema.productionJobs).values({
    dramaId,
    totalEpisodes: drama.totalEpisodes,
    phase: 'scripts',
    status: 'running',
    config: JSON.stringify(opts || {}),
    createdAt: ts,
    updatedAt: ts,
  })
  const jobId = getInsertId(res)
  logTaskStart('Production', 'start', { jobId, dramaId, totalEpisodes: drama.totalEpisodes })
  enqueueRun(jobId)
  return (await getJobById(jobId)) as ProductionJobRow
}

export async function approveProduction(dramaId: number): Promise<ProductionJobRow> {
  const job = await getLatestJob(dramaId)
  if (!job) throw new Error('Belum ada job produksi')
  if (job.status !== 'waiting_approval') {
    throw new Error('Job produksi tidak dalam status menunggu persetujuan')
  }
  await db.update(schema.productionJobs)
    .set({ phase: 'videos', status: 'running', approvedAt: now(), stageDetail: 'Pembuatan video dimulai', errorMsg: null, updatedAt: now() })
    .where(eq(schema.productionJobs.id, job.id))
  logTaskStart('Production', 'approve', { jobId: job.id, dramaId })
  enqueueRun(job.id)
  return (await getJobById(job.id)) as ProductionJobRow
}

export async function cancelProduction(dramaId: number): Promise<ProductionJobRow> {
  const job = await getLatestJob(dramaId)
  if (!job) throw new Error('Belum ada job produksi')
  if (!['running', 'waiting_approval'].includes(job.status)) {
    throw new Error('Job produksi tidak dalam status aktif')
  }
  await db.update(schema.productionJobs)
    .set({ status: 'cancelled', stageDetail: 'Produksi dibatalkan oleh pengguna', updatedAt: now() })
    .where(eq(schema.productionJobs.id, job.id))
  logTaskProgress('Production', 'cancel', { jobId: job.id, dramaId })
  return (await getJobById(job.id)) as ProductionJobRow
}

export async function resumeProduction(dramaId: number): Promise<ProductionJobRow> {
  const job = await getLatestJob(dramaId)
  if (!job) throw new Error('Belum ada job produksi')
  if (!(['failed', 'cancelled', 'interrupted'] as ProductionStatus[]).includes(job.status as ProductionStatus)) {
    throw new Error('Job produksi tidak memerlukan dilanjutkan')
  }
  await db.update(schema.productionJobs)
    .set({ status: 'running', stageDetail: 'Melanjutkan produksi', errorMsg: null, updatedAt: now() })
    .where(eq(schema.productionJobs.id, job.id))
  logTaskStart('Production', 'resume', { jobId: job.id, dramaId })
  enqueueRun(job.id)
  return (await getJobById(job.id)) as ProductionJobRow
}

export async function getProductionStatus(dramaId: number): Promise<Record<string, unknown> | null> {
  const job = await getLatestJob(dramaId)
  if (!job) return null
  const config = parseJobConfig(job)

  const episodes = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    .orderBy(schema.episodes.episodeNumber)

  const characters = await db.select().from(schema.characters).where(and(eq(schema.characters.dramaId, dramaId), isNull(schema.characters.deletedAt)))
  const scenes = await db.select().from(schema.scenes).where(and(eq(schema.scenes.dramaId, dramaId), isNull(schema.scenes.deletedAt)))
  const props = await db.select().from(schema.props).where(and(eq(schema.props.dramaId, dramaId), isNull(schema.props.deletedAt)))

  const units: { label: string; done: boolean }[] = []
  const epStatus: Record<string, unknown>[] = []

  for (const ep of episodes) {
    const sbs = await db.select().from(schema.storyboards)
      .where(and(eq(schema.storyboards.episodeId, ep.id), isNull(schema.storyboards.deletedAt)))
      .orderBy(schema.storyboards.storyboardNumber)

    const scriptDone = !!(ep.content || '').trim() || !!(ep.scriptContent || '').trim()
    const sbCount = sbs.length
    const videosDone = sbCount > 0 ? sbs.every(sb => !!(sb.videoUrl || sb.composedVideoUrl)) : false
    const composedDone = sbCount > 0 ? sbs.every(sb => !!sb.composedImage) : false
    const promptsDone = sbCount > 0 ? sbs.every(sb => !!(sb.videoPrompt || '').trim()) : false

    units.push({ label: `Skrip Episode ${ep.episodeNumber}`, done: scriptDone })
    if (sbCount > 0) {
      units.push({ label: `Storyboard E${ep.episodeNumber}`, done: promptsDone })
      units.push({ label: `Gambar komposisi E${ep.episodeNumber}`, done: composedDone })
      units.push({ label: `Video E${ep.episodeNumber}`, done: videosDone })
    }

    epStatus.push({
      episode_number: ep.episodeNumber,
      title: ep.title,
      script_done: scriptDone,
      storyboards_done: promptsDone,
      composed_images_done: composedDone,
      videos_done: videosDone,
      merged: !!ep.videoUrl,
      shots: sbs.length,
    })
  }

  // Aset & gambar aset (tingkat drama, sebagian besar untuk penampilan "assets" & "asset_images")
  const assetsDone = characters.length > 0 && scenes.length > 0 && props.length > 0
  if (characters.length || scenes.length || props.length) {
    units.push({ label: 'Ekstraksi aset', done: assetsDone })
  }
  const assetsImagesAll = [...characters, ...scenes, ...props]
  if (assetsImagesAll.length) {
    units.push({ label: 'Gambar aset', done: assetsImagesAll.every(a => !!a.imageUrl) })
  }

  const doneUnits = units.filter(u => u.done).length
  const totalUnits = units.length
  const percent = totalUnits ? Math.round((doneUnits / totalUnits) * 100) : 0

  return {
    id: job.id,
    drama_id: job.dramaId,
    total_episodes: job.totalEpisodes,
    phase: job.phase,
    status: job.status,
    stage_detail: job.stageDetail,
    approved_at: job.approvedAt,
    error_msg: job.errorMsg ? translateApiError(job.errorMsg) : null,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    config,
    progress: {
      percent,
      done: doneUnits,
      total: totalUnits,
    },
    episodes: epStatus,
    assets: {
      characters: characters.length,
      scenes: scenes.length,
      props: props.length,
      characters_with_image: characters.filter(c => !!c.imageUrl).length,
      scenes_with_image: scenes.filter(s => !!s.imageUrl).length,
      props_with_image: props.filter(p => !!p.imageUrl).length,
    },
  }
}

/**
 * Dipanggil saat backend start: job yang berstatus running dianggap terputus oleh proses sebelumnya.
 * Job waiting_approval dipertahankan (persetujuan pengguna tetap berlaku); failed/cancelled tetap.
 */
export async function markInterruptedJobs(): Promise<void> {
  const rows = await db.select().from(schema.productionJobs)
  await Promise.all(rows.map(async (job) => {
    if (job.status === 'running') {
      await db.update(schema.productionJobs)
        .set({ status: 'interrupted', stageDetail: 'Produksi terputus oleh restart backend, silakan lanjutkan', updatedAt: now() })
        .where(eq(schema.productionJobs.id, job.id))
      logTaskProgress('Production', 'mark-interrupted', { jobId: job.id, dramaId: job.dramaId, phase: job.phase })
    }
  }))
}