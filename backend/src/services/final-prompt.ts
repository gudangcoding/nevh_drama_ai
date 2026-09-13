/**
 * Layanan prompt akhir
 * Sebelum membuat gambar, pastikan karakter/adegan/properti sudah memiliki "prompt akhir":
 * - Karakter → tiga tampilan (character turnaround: depan/samping/belakang)
 * - Adegan → sudut tetap + latar depan/latar tengah/latar belakang
 * - Properti → produk statis latar putih (single product shot on pure white background)
 * Jika belum ada, jalankan prompt_generator Agent untuk membuat dan menyimpan; gagal mengembalikan '', pemanggil melakukan fallback ke prompt yang disusun secara lokal
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { logTaskError, logTaskProgress } from '../utils/task-logger.js'
import { agentAbortSignal } from '../utils/agent-timeout.js'
import { generateWithRetry } from '../utils/agent-retry.js'

type CharacterRow = typeof schema.characters.$inferSelect
type SceneRow = typeof schema.scenes.$inferSelect
type PropRow = typeof schema.props.$inferSelect

/** Penimpaan model teks/konfigurasi yang dipilih di bar atas (jika tidak dikirim akan mengikuti default Agent dan konfigurasi teks) */
export interface PromptAgentOptions { model?: string; configId?: number }

async function runPromptAgent(episodeId: number, dramaId: number, message: string, opts?: PromptAgentOptions, maxSteps = 12) {
  const agent = mastra.getAgent('prompt_generator')
  if (!agent) throw new Error('Agent prompt gambar tidak tersedia')
  const requestContext = buildAgentRequestContext({
    episodeId,
    dramaId,
    modelOverride: opts?.model || undefined,
    textConfigId: opts?.configId || undefined,
  })
  await generateWithRetry(agent, [{ role: 'user', content: message }], { maxSteps, requestContext, abortSignal: agentAbortSignal(maxSteps) }, 'final-prompt', { episodeId, dramaId })
}

export type PromptBatchItem = { character?: CharacterRow; scene?: SceneRow; prop?: PropRow }

/**
 * Membuat prompt akhir untuk BANYAK aset sekaligus dalam SATU sesi Agent (daripada satu
 * sesi per aset). Ini penghemat token & waktu terbesar pada fase asset_images: drama dengan
 * 15 aset cukup 1 sesi prompt_generator, bukan 15 sesi. Aset yang sudah punya final_prompt
 * dilewati secara otomatis. Kegagalan agent tidak dilempar — pemanggil cukup memakai
 * fallback prompt lokal untuk aset yang masih kosong (pola lama final-prompt.ts).
 */
export async function ensureBatchFinalPrompts(
  episodeId: number,
  dramaId: number,
  items: PromptBatchItem[],
  opts?: PromptAgentOptions,
): Promise<void> {
  const missing = items.filter(it =>
    (it.character && !it.character.finalPrompt) ||
    (it.scene && !it.scene.finalPrompt) ||
    (it.prop && !it.prop.finalPrompt),
  )
  if (!missing.length) return

  const lines = missing.map(it => {
    if (it.character) {
      return `- Karakter ID=${it.character.id} "${it.character.name}": buat prompt akhir tiga tampilan karakter, panggil save_character_final_prompt.`
    }
    if (it.scene) {
      return `- Adegan ID=${it.scene.id} "${it.scene.location}": buat prompt akhir sudut tetap (latar depan/latar tengah/latar belakang), panggil save_scene_final_prompt. Ini adegan kosong tanpa karakter — gambar adegan tidak boleh memuat orang apa pun (termasuk punggung, siluet, pantulan, orang dalam foto).`
    }
    if (it.prop) {
      return `- Properti ID=${it.prop.id} "${it.prop.name}": buat prompt akhir produk putih (single product photo, pure white background), panggil save_prop_final_prompt.`
    }
    throw new Error('PromptBatchItem tidak memiliki aset yang valid')
  })

  logTaskProgress('FinalPrompt', 'batch-generate', { episodeId, dramaId, total: missing.length })
  try {
    await runPromptAgent(episodeId, dramaId,
      `Buat prompt akhir untuk semua aset berikut sekaligus. Proses SEMUA aset dalam daftar, untuk setiap aset panggil tool penyimpanan yang sesuai, dan jangan berhenti sebelum semuanya tersimpan:\n${lines.join('\n')}`,
      opts, Math.min(40, 4 + missing.length * 2))
  } catch (err: any) {
    logTaskError('FinalPrompt', 'batch-generate', { dramaId, total: missing.length, error: err.message })
  }
}

/** Memastikan karakter memiliki prompt akhir tiga tampilan, mengembalikan prompt akhir (gagal mengembalikan ''); saat force mengabaikan prompt yang sudah ada dan memaksa pembuatan ulang */
export async function ensureCharacterFinalPrompt(char: CharacterRow, episodeId: number, force = false, opts?: PromptAgentOptions): Promise<string> {
  if (char.finalPrompt && !force) return char.finalPrompt
  try {
    logTaskProgress('FinalPrompt', 'character-generate', { characterId: char.id, episodeId })
    await runPromptAgent(episodeId, char.dramaId,
      `Buat prompt akhir tiga tampilan untuk karakter "${char.name}" (character_id=${char.id}), dan panggil save_character_final_prompt untuk menyimpan.`, opts)
    const [fresh] = await db.select().from(schema.characters).where(eq(schema.characters.id, char.id))
    return fresh?.finalPrompt || ''
  } catch (err: any) {
    logTaskError('FinalPrompt', 'character-generate', { characterId: char.id, error: err.message })
    return ''
  }
}

/** Memastikan adegan memiliki prompt akhir sudut tetap (latar depan/tengah/belakang), mengembalikan prompt akhir (gagal mengembalikan ''); saat force mengabaikan prompt yang sudah ada dan memaksa pembuatan ulang */
export async function ensureSceneFinalPrompt(scene: SceneRow, episodeId: number, force = false, opts?: PromptAgentOptions): Promise<string> {
  if (scene.finalPrompt && !force) return scene.finalPrompt
  try {
    logTaskProgress('FinalPrompt', 'scene-generate', { sceneId: scene.id, episodeId })
    await runPromptAgent(episodeId, scene.dramaId,
      `Buat prompt akhir sudut tetap (latar depan/latar tengah/latar belakang) untuk adegan "${scene.location}" (scene_id=${scene.id}), dan panggil save_scene_final_prompt untuk menyimpan. Perhatikan: ini adalah adegan kosong tanpa karakter — gambar adegan tidak boleh memuat orang apa pun (termasuk punggung, siluet, pantulan, orang dalam foto), meskipun deskripsi adegan menyebutkan aktivitas karakter harus dihilangkan, hanya simpan adegannya saja.`, opts)
    const [fresh] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, scene.id))
    return fresh?.finalPrompt || ''
  } catch (err: any) {
    logTaskError('FinalPrompt', 'scene-generate', { sceneId: scene.id, error: err.message })
    return ''
  }
}

/** Memastikan properti memiliki prompt akhir produk putih, mengembalikan prompt akhir (gagal mengembalikan ''); saat force mengabaikan prompt yang sudah ada dan memaksa pembuatan ulang */
export async function ensurePropFinalPrompt(prop: PropRow, episodeId: number, force = false, opts?: PromptAgentOptions): Promise<string> {
  if (prop.finalPrompt && !force) return prop.finalPrompt
  try {
    logTaskProgress('FinalPrompt', 'prop-generate', { propId: prop.id, episodeId })
    await runPromptAgent(episodeId, prop.dramaId,
      `Buat prompt akhir produk putih untuk properti "${prop.name}" (prop_id=${prop.id}), dan panggil save_prop_final_prompt untuk menyimpan.`, opts)
    const [fresh] = await db.select().from(schema.props).where(eq(schema.props.id, prop.id))
    return fresh?.finalPrompt || ''
  } catch (err: any) {
    logTaskError('FinalPrompt', 'prop-generate', { propId: prop.id, error: err.message })
    return ''
  }
}
