/**
 * Rute pengaturan aplikasi — titik masuk baca/tulis konfigurasi global (saat ini: bahasa konten AI)
 */
import { Hono } from 'hono'
import { getContentLanguage, setContentLanguage, CONTENT_LANGUAGES, type ContentLanguage } from '../services/app-settings.js'
import { success, badRequest } from '../utils/response.js'

const app = new Hono()

// GET /content-language — bahasa konten AI saat ini
app.get('/content-language', async (c) => {
  return success(c, { language: await getContentLanguage() })
})

// PUT /content-language — atur bahasa konten AI (body: { language: 'zh'|'en'|'ja'|'ko' })
app.put('/content-language', async (c) => {
  const body = await c.req.json().catch(() => null)
  const language = body?.language
  if (!(CONTENT_LANGUAGES as readonly string[]).includes(language)) {
    return badRequest(c, `language harus salah satu dari ${CONTENT_LANGUAGES.join(' / ')}`)
  }
  const saved = await setContentLanguage(language as ContentLanguage)
  return success(c, { language: saved })
})

export default app
