/**
 * Rute manajemen prompt Agent — baca/tulis workspace/prompts/<agent_type>[.<lang>].md
 * Operasi file jail di dalam direktori backend/workspace/ (mirip dengan rute skills)
 * ?lang=en/ja/ko baca/tulis varian bahasa; zh/ tidak diatur adalah versi dasar (perilaku historis)
 */
import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { skillsManagerWorkspace } from '../agents/skills.js'
import { validAgentTypes, DEFAULT_PROMPTS } from '../agents/index.js'
import { loadAgentPromptFile, serializePromptFile, promptFilePath } from '../agents/prompts.js'

const app = new Hono()
const fsm = () => skillsManagerWorkspace.filesystem!

const checkType = (type: string) => validAgentTypes.includes(type)
const LANGS = ['zh', 'en', 'ja', 'ko', 'id']
const normalizeLang = (v?: string) => (v && LANGS.includes(v) ? v : 'zh')

// GET /prompts — daftar semua status prompt Agent (skala versi dasar; name/model hanya milik versi dasar)
app.get('/', async (c) => {
  const list = await Promise.all(validAgentTypes.map(async (type) => {
    const file = await loadAgentPromptFile(type)
    return {
      agent_type: type,
      name: file?.name || DEFAULT_PROMPTS[type].name,
      model: file?.model || '',
      is_default: !file,
    }
  }))
  return success(c, list)
})

// GET /prompts/:type?lang= — konten efektif (varian bahasa diutamakan, tidak ada kembali ke versi dasar, kemudian tidak ada kembali ke default kode)
// is_default=true berarti tidak ada file independen untuk bahasa saat ini (konten merupakan versi fallback), frontend menggunakannya untuk menampilkan petunjuk "Mengikuti Bahasa Tiongkok"
app.get('/:type', async (c) => {
  const type = c.req.param('type')
  if (!checkType(type)) return badRequest(c, 'Tipe Agent tidak dikenal')
  const lang = normalizeLang(c.req.query('lang'))
  const [file, base] = await Promise.all([
    loadAgentPromptFile(type, lang),
    lang === 'zh' ? Promise.resolve(null) : loadAgentPromptFile(type),
  ])
  // Non-zh dan varian tidak ada, file merupakan versi dasar; konfirmasi keberadaan varian melalui jalur
  const variantExists = lang !== 'zh' && await fsm().exists(promptFilePath(type, lang))
  if (file) {
    return success(c, {
      agent_type: type,
      lang,
      name: base?.name || file.name || DEFAULT_PROMPTS[type].name,
      model: base?.model || file.model,
      system_prompt: file.instructions,
      is_default: lang === 'zh' ? false : !variantExists,
    })
  }
  return success(c, {
    agent_type: type,
    lang,
    name: DEFAULT_PROMPTS[type].name,
    model: '',
    system_prompt: DEFAULT_PROMPTS[type].instructions,
    is_default: true,
  })
})

// PUT /prompts/:type?lang= — simpan sebagai file prompt (lang non-zh tulis varian bahasa; model hanya menyertai versi dasar)
app.put('/:type', async (c) => {
  const type = c.req.param('type')
  if (!checkType(type)) return badRequest(c, 'Tipe Agent tidak dikenal')
  const body = await c.req.json()
  const lang = normalizeLang(c.req.query('lang') ?? body.lang)
  const instructions = String(body.system_prompt ?? '').trim()
  if (!instructions) return badRequest(c, 'system_prompt wajib diisi')
  if (lang === 'zh') {
    const name = String(body.name || DEFAULT_PROMPTS[type].name)
    const model = String(body.model ?? '').trim()
    await fsm().writeFile(promptFilePath(type), serializePromptFile({ name, model, instructions }), { recursive: true })
    return success(c, { agent_type: type, lang, name, model, is_default: false })
  }
  // Varian bahasa: model tidak dibaca dari varian, name hanya untuk tampilan; simpan name milik varian sendiri (tidak ada gunakan versi dasar/default)
  const base = await loadAgentPromptFile(type)
  const name = String(body.name || base?.name || DEFAULT_PROMPTS[type].name)
  await fsm().writeFile(promptFilePath(type, lang), serializePromptFile({ name, model: '', instructions }), { recursive: true })
  return success(c, { agent_type: type, lang, name, is_default: false })
})

// POST /prompts/:type/reset?lang= — hapus file bahasa yang bersangkutan, fallback (varian→versi dasar; versi dasar→default kode)
app.post('/:type/reset', async (c) => {
  const type = c.req.param('type')
  if (!checkType(type)) return badRequest(c, 'Tipe Agent tidak dikenal')
  const lang = normalizeLang(c.req.query('lang'))
  const path = promptFilePath(type, lang)
  if (await fsm().exists(path)) await fsm().deleteFile(path)
  return success(c, { agent_type: type, lang, is_default: true })
})

export default app
