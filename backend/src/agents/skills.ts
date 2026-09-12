/**
 * Workspace Agent — kemampuan native Mastra
 * Setiap Agent memiliki satu Workspace:
 * - filesystem: di-jail ke direktori backend/workspace/, Agent mendapatkan tool baca/tulis file
 * - skills: mendaftarkan SKILL.md khusus setiap Agent dari workspace/skills/
 * Saat menyuntikkan instructions, teks skill lengkap digabungkan (penyuntikan native hanya metadata, penyuntikan teks lengkap menjamin perilaku konsisten)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Workspace, LocalFilesystem } from '@mastra/core/workspace'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Versi desktop menyuntikkan WORKSPACE_PATH dari proses utama Electron (salinan yang dapat ditulis di userData); dev menggunakan backend/workspace sebagai anchor
const WORKSPACE_DIR = process.env.WORKSPACE_PATH
  ? path.resolve(process.env.WORKSPACE_PATH)
  : path.resolve(__dirname, '../../workspace')
const SKILLS_DIR = path.join(WORKSPACE_DIR, 'skills')

// Memastikan direktori kerja ada saat startup (akar jail untuk baca/tulis file Agent)
  // Setelah di-pack, modul desktop mungkin masih dimuat dari lokasi hanya-baca, kegagalan tidak menghalangi startup (lapisan route akan memberikan error yang jelas)
  try {
    fs.mkdirSync(SKILLS_DIR, { recursive: true })
  } catch (err) {
    console.warn(`[skills] Gagal membuat direktori kerja (lingkungan hanya-baca?): ${(err as Error).message}`)
  }

/** Direktori skill yang didaftarkan setiap Agent (relatif terhadap workspace/skills/, termasuk direktori sub-spesifikasi; nama direktori harus sesuai Spesifikasi Agent Skills: huruf kecil + tanda hubung) */
const AGENT_SKILL_MAP: Record<string, string[]> = {
  episode_expander: [],
  script_rewriter: ['script-rewriter'],
  extractor: ['extractor'],
  storyboard_breaker: ['storyboard-breaker'],
  prompt_generator: [
    'prompt-generator/character-prompt',
    'prompt-generator/scene-prompt',
    'prompt-generator/prop-prompt',
    'prompt-generator/video-prompt',
  ],
}

/** Workspace setiap Agent (direktori kerja filesystem + pendaftaran skill native)
 *  Skills menggunakan resolver dinamis untuk mencocokkan berdasarkan awalan direktori: sub-skill baru yang dibuat di halaman pengaturan dapat ditemukan tanpa restart */
export const skillWorkspaces: Record<string, Workspace> = Object.fromEntries(
  Object.entries(AGENT_SKILL_MAP).map(([agentType, prefixes]) => [
    agentType,
    new Workspace({
      id: `workspace-${agentType}`,
      name: `${agentType} workspace`,
      filesystem: new LocalFilesystem({ basePath: WORKSPACE_DIR }),
      skills: () => scanSkillPaths().filter(p =>
        prefixes.some(prefix => p === `skills/${prefix}` || p.startsWith(`skills/${prefix}/`))),
    }),
  ]),
)

/** Memindai secara rekursif semua direktori yang berisi SKILL.md di bawah workspace/skills/ (jalur relatif terhadap root workspace) */
function scanSkillPaths(): string[] {
  const found: string[] = []
  const walk = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = path.join(dir, entry.name)
      if (fs.existsSync(path.join(full, 'SKILL.md'))) found.push(`skills/${rel}`)
      walk(full, rel)
    }
  }
  walk(SKILLS_DIR, '')
  return found
}

/**
 * Workspace Manajemen Skill (untuk CRUD halaman pengaturan)
 * Skills menggunakan resolver dinamis, direktori skill yang baru dibuat/hapus dapat ditemukan tanpa restart
 */
export const skillsManagerWorkspace = new Workspace({
  id: 'workspace-skills-manager',
  name: 'skills manager',
  filesystem: new LocalFilesystem({ basePath: WORKSPACE_DIR }),
  skills: () => scanSkillPaths(),
})

function formatSkillSection(skillId: string, content: string): string {
  return [`## Skill: ${skillId}`, content].join('\n')
}

/** Menghapus frontmatter dari file bergaya SKILL.md, mengembalikan isi (untuk dibaca langsung oleh varian bahasa) */
function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return (m ? raw.slice(m[0].length) : raw).trim()
}

/** Membaca isi varian bahasa skill (SKILL.<lang>.md, dibaca langsung melewati cache selalu terbaru); mengembalikan null jika tidak ada */
async function readLocalizedSkill(relPath: string, lang: string): Promise<string | null> {
  const fsm = skillsManagerWorkspace.filesystem!
  const p = `skills/${relPath}/SKILL.${lang}.md`
  try {
    if (!await fsm.exists(p)) return null
    const body = stripFrontmatter(String(await fsm.readFile(p, { encoding: 'utf-8' })))
    return body || null
  } catch {
    return null
  }
}

/** Membaca teks lengkap skill khusus Agent (melalui API workspace.skills, mempertahankan format penyuntikan asli)
 *  Direktori AGENT_SKILL_MAP dicocokkan berdasarkan awalan: direktori itu sendiri dan semua SKILL.md di sub-direktornya akan disuntikkan,
 *  sehingga sub-skill baru yang dibuat di halaman pengaturan (misalnya storyboard-breaker/xxx) dapat berlaku tanpa mengubah kode.
 *  Ketika lang bukan zh, setiap skill memprioritaskan SKILL.<lang>.md, jika tidak ada kembali ke versi dasar (Cina) */
export async function loadAgentSkills(agentType: string, lang?: string | null): Promise<string> {
  const workspace = skillWorkspaces[agentType]
  const prefixes = AGENT_SKILL_MAP[agentType] || []
  if (!workspace || !prefixes.length) return ''

  const allPaths = scanSkillPaths().map(p => p.replace(/^skills\//, ''))
  const relPaths = allPaths.filter(p =>
    prefixes.some(prefix => p === prefix || p.startsWith(prefix + '/')))

  const useLocalized = Boolean(lang && lang !== 'zh')
  const contents: string[] = []
  for (const relPath of relPaths) {
    let body: string | null | undefined
    if (useLocalized) body = await readLocalizedSkill(relPath, lang!)
    if (!body) {
      const skill = await workspace.skills?.get(`skills/${relPath}`)
      body = skill?.instructions?.trim()
    }
    if (body) contents.push(formatSkillSection(relPath, body))
  }

  if (!contents.length) return ''

  return [
    '以下是该 Agent 专属的项目技能规范（SKILL.md）。',
    '不同 Agent 会加载不同 skill；你只需要遵守当前注入的这些技能。',
    '你必须在不违背当前工具边界的前提下优先遵守这些规范；若与用户明确要求冲突，以用户要求为准。',
    '',
    contents.join('\n\n'),
  ].join('\n')
}

/**
 * Memaksa pemindaian ulang skill semua Agent (dipanggil setelah menyunting SKILL.md)
 * maybeRefresh bertanggung jawab mendeteksi penambahan/penghapusan direktori (perubahan jalur resolver dinamis), refresh bertanggung jawab pembaruan konten
 * (mtime direktori tidak diperbarui karena menyunting isi file, validasi kedaluwarsa hanya dapat diandalkan dari maybeRefresh)
 */
export async function refreshSkillWorkspaces(): Promise<void> {
  await Promise.all(
    [...Object.values(skillWorkspaces), skillsManagerWorkspace]
      .map(async workspace => {
        await workspace.skills?.maybeRefresh()
        await workspace.skills?.refresh()
      }),
  )
}
