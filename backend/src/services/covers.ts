/**
 * Layanan sampul proyek — menghasilkan/memperbarui thumbnail drama (dramas.thumbnail) dari prompt
 * - Saat proyek dibuat dari draft sinopsis: cover_prompt disimpan di metadata → dipakai di sini
 * - User dapat memicu ulang kapan saja dengan prompt baru (POST /dramas/:id/cover)
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { getDramaStylePrompt } from './style-preset.js'
import { generateImage } from './generation.js'
import { logTaskProgress } from '../utils/task-logger.js'

/** Ukuran kanvas sesuai rasio aspek proyek (persyaratan adapter gambar ukuran WxH) */
const COVER_SIZE: Record<string, string> = {
  '16:9': '1920x1080',
  '9:16': '1080x1920',
  '1:1': '1080x1080',
  adaptive: '1920x1080',
}

export interface CoverGenerateOptions {
  /** Prompt sampul bebas dari user; jika kosong gunakan cover_prompt tersimpan / otomatis */
  prompt?: string
  configId?: number
  size?: string
}

function parseMetadata(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) || {}
  } catch {
    return {}
  }
}

/** Menyusun prompt akhir: elemen proyek + sarana visual + konten sampul */
export async function buildCoverPrompt(drama: typeof schema.dramas.$inferSelect, explicitPrompt?: string): Promise<string> {
  const meta = parseMetadata(drama.metadata)
  const stored = String(meta.cover_prompt || '').trim()
  const content = (explicitPrompt && explicitPrompt.trim())
    || stored
    || buildAutoCoverPrompt(drama)

  const style = await getDramaStylePrompt(drama.id)
  const parts: string[] = []
  if (style) parts.push(style)
  if (content) parts.push(content)
  // Poster bagian atas selalu menekankan kualitas poster film; instruksi tanpa teks untuk menghindari tulisan aneh pada hasil
  if (!String(content || '').toLowerCase().includes('poster')) {
    parts.push('cinematic movie poster style, high detail, no text, no watermark, no letters')
  }
  return parts.filter(Boolean).join(', ')
}

/** Prompt auto ketika proyek belum punya cover_prompt (dibuat manual) */
function buildAutoCoverPrompt(drama: typeof schema.dramas.$inferSelect): string {
  const title = drama.title || 'drama serial'
  const genre = drama.genre || 'drama'
  const synopsis = String(drama.synopsis || '').slice(0, 220)
  return [
    `a ${genre} short-drama teaser poster for a series titled "${title}"`,
    synopsis ? `theme: ${synopsis}` : '',
  ].filter(Boolean).join(', ')
}

/**
 * Memicu pembuatan sampul proyek (async). Mengembalikan id task sys_task.
 * Saat gambar selesai, writeBackImageAssets menulis ke dramas.thumbnail + thumbnail-nya.
 */
export async function generateDramaCover(dramaId: number, opts: CoverGenerateOptions = {}): Promise<number> {
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  if (!drama) throw new Error('Drama tidak ditemukan')

  const prompt = await buildCoverPrompt(drama, opts.prompt)
  const size = opts.size || COVER_SIZE[drama.aspectRatio || ''] || '1920x1080'

  logTaskProgress('CoverTask', 'enqueue', { dramaId, prompt: prompt.slice(0, 200), size })

  const taskId = await generateImage({
    dramaId,
    coverDramaId: dramaId,
    prompt,
    configId: opts.configId,
    size,
  })

  logTaskProgress('CoverTask', 'enqueued', { dramaId, taskId })
  return taskId
}