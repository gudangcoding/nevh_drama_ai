/**
 * Pemuatan file prompt Agent — workspace/prompts/<agent_type>.md
 * Format file (mengikuti konvensi SKILL.md):
 *   ---
 *   name: Pecah Storyboard
 *   model: ""        # Opsional, menimpa model teks; kosong = gunakan default layanan AI
 *   ---
 *   <isi system prompt>
 * File adalah satu-satunya sumber kebenaran; ketika file tidak ada, pemanggil kembali ke nilai default kode.
 */
import { skillsManagerWorkspace } from './skills.js'

export interface AgentPromptFile {
  name: string
  model: string
  instructions: string
}

const fsm = () => skillsManagerWorkspace.filesystem!
/** Jalur file prompt; ketika lang adalah en/ja/ko mengembalikan varian bahasa (<type>.<lang>.md), zh/kosong adalah versi dasar */
export const promptFilePath = (agentType: string, lang?: string | null) =>
  `prompts/${agentType}${lang && lang !== 'zh' ? `.${lang}` : ''}.md`

/** Mengurai file prompt (frontmatter hanya mendukung dua bidang skalar name/model, tidak perlu dependensi yaml) */
export function parsePromptFile(raw: string): AgentPromptFile {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  let name = ''
  let model = ''
  let body = raw
  if (fmMatch) {
    const fm = fmMatch[1]
    const get = (key: string) => {
      const m = fm.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?\\s*$`, 'm'))
      return (m?.[1] || '').trim()
    }
    name = get('name')
    model = get('model')
    body = raw.slice(fmMatch[0].length)
  }
  return { name, model, instructions: body.trim() }
}

/** Menserialisasi ke konten file prompt (untuk digunakan oleh antarmuka penyimpanan) */
export function serializePromptFile(file: AgentPromptFile): string {
  return `---\nname: ${file.name}\nmodel: "${file.model}"\n---\n\n${file.instructions.trim()}\n`
}

/** Membaca file prompt di jalur tertentu; mengembalikan null jika file tidak ada atau parsing gagal */
async function readPromptFile(path: string): Promise<AgentPromptFile | null> {
  try {
    if (!await fsm().exists(path)) return null
    const raw = String(await fsm().readFile(path, { encoding: 'utf-8' }))
    const parsed = parsePromptFile(raw)
    return parsed.instructions ? parsed : null
  } catch {
    return null
  }
}

/** Membaca file prompt versi dasar (Tiongkok) — bidang model selalu diurai dari versi dasar, menghindari drift file multibahasa */
export function loadBasePromptFile(agentType: string): Promise<AgentPromptFile | null> {
  return readPromptFile(promptFilePath(agentType))
}

/**
 * Membaca file prompt Agent; ketika lang bukan zh, memprioritaskan varian bahasa (<type>.<lang>.md), jika tidak ada kembali ke versi dasar.
 * Bidang model varian tidak valid: saat mengembalikan, model selalu mengambil nilai dari versi dasar.
 */
export async function loadAgentPromptFile(agentType: string, lang?: string | null): Promise<AgentPromptFile | null> {
  const base = await loadBasePromptFile(agentType)
  if (!lang || lang === 'zh') return base
  const localized = await readPromptFile(promptFilePath(agentType, lang))
  if (!localized) return base
  return { ...localized, model: base?.model || '' }
}
