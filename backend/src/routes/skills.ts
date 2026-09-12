/**
 * Rute manajemen skill — semua melalui Mastra Workspace API baca/tulis
 * Operasi file jail di dalam direktori backend/workspace/
 */
import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { refreshSkillWorkspaces, skillsManagerWorkspace } from '../agents/skills.js'

const app = new Hono()
const fsm = () => skillsManagerWorkspace.filesystem!
const LANGS = ['zh', 'en', 'ja', 'ko', 'id']
const normalizeLang = (v?: string) => (v && LANGS.includes(v) ? v : 'zh')
/** Jalur file skill; lang non-zh adalah varian bahasa SKILL.<lang>.md */
const skillFile = (id: string, lang?: string) => `skills/${id}/SKILL${lang && lang !== 'zh' ? `.${lang}` : ''}.md`
const SKILL_ID_SEGMENT = /^[a-z0-9-]+$/

// GET /skills?lang= — Daftar semua skill (ditemukan native melalui workspace.skills)
// lang non-zh dan varian ada, nama/deskripsi diambil dari frontmatter varian bahasa (tidak ada kembali ke versi dasar)
app.get('/', async (c) => {
  const lang = normalizeLang(c.req.query('lang'))
  const metas = await skillsManagerWorkspace.skills?.list() || []
  const out = []
  for (const meta of metas) {
    const id = meta.path.replace(/^skills\//, '')
    let name = meta.name
    let description = meta.description || ''
    if (lang !== 'zh' && await fsm().exists(skillFile(id, lang))) {
      const raw = String(await fsm().readFile(skillFile(id, lang), { encoding: 'utf-8' }))
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] || ''
      const n = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim()
      const d = /^description:\s*(.+)$/m.exec(fm)?.[1]?.trim()
      if (n) name = n
      if (d) description = d
    }
    out.push({ id, name, description })
  }
  return success(c, out)
})

// GET /skills/:id?lang= — Dapatkan konten skill (mentah, termasuk frontmatter untuk diedit)
// Saat lang non-zh, baca varian bahasa; jika varian tidak ada, kembali ke versi dasar dan tandai is_default=true (frontend menampilkan petunjuk 'Mengikuti Bahasa Tiongkok')
app.get('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  const lang = normalizeLang(c.req.query('lang'))
  if (!await fsm().exists(skillFile(id))) return badRequest(c, '技能不存在')
  const variantExists = lang !== 'zh' && await fsm().exists(skillFile(id, lang))
  const content = await fsm().readFile(skillFile(id, variantExists ? lang : undefined), { encoding: 'utf-8' })
  return success(c, { id, lang, content, is_default: lang !== 'zh' && !variantExists })
})

// PUT /skills/:id?lang= — Perbarui konten skill (saat lang non-zh, tulis varian bahasa; perubahan versi dasar perlu refresh cache skill)
app.put('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  const body = await c.req.json()
  const lang = normalizeLang(c.req.query('lang') ?? body.lang)
  if (lang !== 'zh' && !await fsm().exists(skillFile(id))) return badRequest(c, '技能不存在')
  await fsm().writeFile(skillFile(id, lang), body.content, { recursive: true })
  // mtime direktori tidak diupdate saat isi file diedit (APFS), refresh eksplisit cache skill; varian bahasa dibaca langsung tidak perlu refresh
  if (lang === 'zh') await refreshSkillWorkspaces()
  return success(c)
})

// POST /skills — Create new skill directory
app.post('/', async (c) => {
  const body = await c.req.json()
  const { id, description } = body
  if (!id) return badRequest(c, 'Skill id 必填')
  // Spesifikasi skill Mastra: nama frontmatter harus sama dengan nama direktori, hanya diperbolehkan huruf kecil/angka/tanda hubung
  const segments = String(id).split('/')
  if (!segments.every((seg: string) => SKILL_ID_SEGMENT.test(seg))) {
    return badRequest(c, 'Skill id 每段只能包含小写字母、数字和连字符')
  }
  if (await fsm().exists(skillFile(id))) return badRequest(c, '技能已存在')

  const name = segments[segments.length - 1]
  const content = `---
name: ${name}
description: ${description || ''}
---

# ${name}

Write your skill content here.
`
  await fsm().writeFile(skillFile(id), content, { recursive: true, overwrite: false })
  await refreshSkillWorkspaces()
  return success(c, { id, name, description: description || '' })
})

// DELETE /skills/:id — Delete skill directory
app.delete('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  if (!await fsm().exists(`skills/${id}`)) return badRequest(c, '技能不存在')
  await fsm().rmdir(`skills/${id}`, { recursive: true })
  await refreshSkillWorkspaces()
  return success(c)
})

export default app
