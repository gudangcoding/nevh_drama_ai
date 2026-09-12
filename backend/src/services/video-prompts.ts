/**
 * Tugas prompt video massal — menjalankan prompt_generator Agent secara asinkron satu per satu untuk storyboard yang kekurangan video_prompt
 * State memori dalam proses: melacak satu tugas per episode, tidak memulai berulang saat sedang berjalan; status hilang setelah restart
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { translateApiError } from '../utils/error-translate.js'

export interface VideoPromptBatchStatus {
  status: 'running' | 'done' | 'error'
  total: number
  completed: number
  failed: number
  current_storyboard_id?: number
  started_at: string
  finished_at?: string
  error?: string
}

const tasks = new Map<number, VideoPromptBatchStatus>()

/** Memulai pembuatan massal (langsung kembali); saat sedang berjalan mengembalikan started:false,total:-1; jika tidak ada storyboard yang menunggu dikembalikan started:false,total:0;
 *  Saat storyboardIds dimasukkan hanya memproses storyboard yang dipilih (bahkan jika sudah ada prompt tetap dibuat ulang), jika tidak memproses semua storyboard yang kekurangan prompt */
export async function startVideoPromptBatch(
  episodeId: number,
  dramaId: number,
  opts: { model?: string; configId?: number } = {},
  storyboardIds?: number[],
): Promise<{ started: boolean; total: number }> {
  if (tasks.get(episodeId)?.status === 'running') return { started: false, total: -1 }

  const sbs = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
  const pending = storyboardIds?.length
    ? sbs.filter(sb => storyboardIds.includes(sb.id))
    : sbs.filter(sb => !(sb.videoPrompt || '').trim())
  if (!pending.length) return { started: false, total: 0 }

  // Label model video: mengikuti konfigurasi video yang dikunci untuk episode tersebut, agar Agent dapat menghasilkan berdasarkan karakteristik model
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  let videoLabel = 'default'
  if (ep?.videoConfigId) {
    const [cfg] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, ep.videoConfigId))
    if (cfg) videoLabel = `${cfg.name} (${cfg.provider})`
  }

  const task: VideoPromptBatchStatus = {
    status: 'running',
    total: pending.length,
    completed: 0,
    failed: 0,
    started_at: new Date().toISOString(),
  }
  tasks.set(episodeId, task)

  logTaskStart('VideoPrompt', 'batch', { episodeId, dramaId, total: pending.length, model: opts.model || undefined })
  ;(async () => {
    const agent = mastra.getAgent('prompt_generator')
    if (!agent) throw new Error('Agent prompt video tidak tersedia')
    const requestContext = buildAgentRequestContext({
      episodeId,
      dramaId,
      modelOverride: opts.model || undefined,
      textConfigId: opts.configId || undefined,
    })
    for (const sb of pending) {
      task.current_storyboard_id = sb.id
      logTaskProgress('VideoPrompt', 'batch-shot', { episodeId, storyboardId: sb.id, index: task.completed + task.failed + 1, total: task.total })
      try {
        await agent.generate([{
          role: 'user',
          content: `Buat video_prompt (prompt pembuatan video) untuk storyboard #${sb.storyboardNumber}(ID:${sb.id}). Model video:${videoLabel}, buat sesuai karakteristik dan batasan durasi model tersebut.
Panggil read_storyboard_context terlebih dahulu untuk mendapatkan deskripsi visual storyboard ini (berisi sub-shot 【ShotN】 dan dialog/narasi), suasana, dan durasi, lalu buat video_prompt (baris pertama adalah header informasi: berisi daftar karakter dan adegan yang muncul di storyboard ini, rujuk dengan @namaKarakter/@namaAdegan; setelah itu dibagi menjadi baris per segmen 3 detik, rujuk materi referensi dengan @namaKarakter/@namaAdegan/@namaProperti; dalam satu segmen diperbolehkan beberapa shot berganti (ganti ukuran shot/sudut/objek, segmen yang berbeda boleh berupa ukuran/sudut/objek yang berbeda), tetapi tidak boleh melintasi adegan, titik potong sejajar dengan struktur 【ShotN】 pada description storyboard), lalu panggil update_storyboard untuk menyimpan ke storyboard ID:${sb.id}. Untuk parameter update_storyboard hanya kirim dua kunci: storyboard_id dan video_prompt, jangan kembalikan field lain dari storyboard ini (title, description, scene_id, dll tidak usah dikirim), jangan urai ulang seluruh episode.`,
        }], { maxSteps: 8, requestContext })
        // Menentukan keberhasilan berdasarkan apa yang benar-benar tersimpan di database
        const [fresh] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, sb.id))
        if ((fresh?.videoPrompt || '').trim()) task.completed++
        else {
          task.failed++
          logTaskError('VideoPrompt', 'batch-shot', { storyboardId: sb.id, error: 'agent finished but video_prompt is empty' })
        }
      } catch (err: any) {
        task.failed++
        logTaskError('VideoPrompt', 'batch-shot', { storyboardId: sb.id, error: err?.message })
      }
    }
  })()
    .then(() => {
      task.status = 'done'
      task.finished_at = new Date().toISOString()
      task.current_storyboard_id = undefined
      logTaskSuccess('VideoPrompt', 'batch', { episodeId, total: task.total, completed: task.completed, failed: task.failed })
    })
    .catch((err: any) => {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      task.error = translateApiError(err?.message || 'Pembuatan massal gagal')
      logTaskError('VideoPrompt', 'batch', { episodeId, error: err?.message })
    })
  return { started: true, total: pending.length }
}

export function getVideoPromptBatchStatus(episodeId: number): VideoPromptBatchStatus | null {
  return tasks.get(episodeId) || null
}
