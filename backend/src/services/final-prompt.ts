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

type CharacterRow = typeof schema.characters.$inferSelect
type SceneRow = typeof schema.scenes.$inferSelect
type PropRow = typeof schema.props.$inferSelect

/** Penimpaan model teks/konfigurasi yang dipilih di bar atas (jika tidak dikirim akan mengikuti default Agent dan konfigurasi teks) */
export interface PromptAgentOptions { model?: string; configId?: number }

async function runPromptAgent(episodeId: number, dramaId: number, message: string, opts?: PromptAgentOptions) {
  const agent = mastra.getAgent('prompt_generator')
  if (!agent) throw new Error('Agent prompt gambar tidak tersedia')
  const requestContext = buildAgentRequestContext({
    episodeId,
    dramaId,
    modelOverride: opts?.model || undefined,
    textConfigId: opts?.configId || undefined,
  })
  await agent.generate([{ role: 'user', content: message }], { maxSteps: 12, requestContext })
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
