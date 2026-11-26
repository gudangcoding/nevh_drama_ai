import 'dotenv/config'
// undici (fetch bawaan Node) mematikan permintaan bila header tidak terkirim sesuai batas
// (default 300 detik). Provider AI kustom bisa menahan respons lebih lama, jadi dinaikkan
// agar tidak memunculkan "Headers Timeout Error" pada permintaan yang sebenarnya selesai.
process.env.NODE_HTTP_HEADERS_TIMEOUT ||= String(Number(process.env.AI_HTTP_HEADERS_TIMEOUT_MS || 900_000))
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import path from 'path'
import { fileURLToPath } from 'url'

import dramas from './routes/dramas.js'
import episodes from './routes/episodes.js'
import storyboards from './routes/storyboards.js'
import scenes from './routes/scenes.js'
import characters from './routes/characters.js'
import tasks from './routes/tasks.js'
import upload from './routes/upload.js'
import aiConfigs, { aiProviders } from './routes/aiConfigs.js'
import stylePresets from './routes/stylePresets.js'
import prompts from './routes/prompts.js'
import agent from './routes/agent.js'
import merge from './routes/merge.js'
import synopsis from './routes/synopsis.js'
import publish from './routes/publish.js'
import skills from './routes/skills.js'
import props from './routes/props.js'
import settings from './routes/settings.js'
import storage from './routes/storage.js'
import serverUpdate from './routes/serverUpdate.js'
import auth from './routes/auth.js'
import { requestLogger, errorHandler } from './middleware/logger.js'
import { requireAuth } from './middleware/auth.js'
import { db, schema } from './db/index.js'
import { eq } from 'drizzle-orm'
import { now } from './utils/response.js'
import { DATA_ROOT } from './utils/paths.js'
import { markInterruptedJobs } from './services/production.js'
import { seedDefaultAdmin, cleanupExpiredSessions } from './services/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

const app = new Hono()

// Middleware
app.use('*', cors({
  origin: ['http://localhost:3013', 'http://localhost:5679'],
  credentials: true,
}))
app.use('*', requestLogger)
app.use('*', errorHandler)

// Health check (version untuk inspeksi deployment/pemeriksaan update untuk memverifikasi versi yang sedang berjalan)
app.get('/api/v1/health', (c) => c.json({
  status: 'ok',
  version: process.env.HUOBAO_VERSION || undefined,
  timestamp: new Date().toISOString(),
}))

// API routes
// Rute publik: health + autentikasi (register/login/logout). /auth/me dilindungi internal.
const api = new Hono()
api.route('/auth', auth)

// Rute terlindungi: semua rute lain memerlukan token login yang valid.
// Isolasi data (user hanya melihat drama miliknya, admin melihat semua) ditegakkan per-handler
// melalui services/ownership.ts.
const protectedApi = new Hono()
protectedApi.use('*', requireAuth)
protectedApi.route('/dramas', dramas)
protectedApi.route('/episodes', episodes)
protectedApi.route('/storyboards', storyboards)
protectedApi.route('/scenes', scenes)
protectedApi.route('/characters', characters)
protectedApi.route('/tasks', tasks)
protectedApi.route('/upload', upload)
protectedApi.route('/ai-configs', aiConfigs)
protectedApi.route('/ai-providers', aiProviders)
protectedApi.route('/style-presets', stylePresets)
protectedApi.route('/prompts', prompts)
protectedApi.route('/agent', agent)
protectedApi.route('/synopsis', synopsis)
protectedApi.route('/publish', publish)
protectedApi.route('/merge', merge)
protectedApi.route('/skills', skills)
protectedApi.route('/props', props)
protectedApi.route('/storage', storage)
protectedApi.route('/settings', settings)
protectedApi.route('/server-update', serverUpdate)

api.route('/', protectedApi)

app.route('/api/v1', api)

// Serve static files (storage)
// Gambar/video yang dihasilkan dinamai berdasarkan uuid, konten tidak berubah, ditandai sebagai immutable agar browser melakukan cache jangka panjang
app.use('/static/*', async (c, next) => {
  await next()
  if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable')
})
app.use('/static/*', serveStatic({ root: DATA_ROOT }))

// Serve frontend (production build) — versi desktop menyuntikkan FRONTEND_DIST dari proses utama (resources/frontend)
const distPath = process.env.FRONTEND_DIST || path.join(projectRoot, 'frontend', 'dist')
app.use('*', serveStatic({ root: distPath }))
app.get('*', serveStatic({ root: distPath, path: 'index.html' }))

const port = Number(process.env.PORT || 5679)
console.log(`🚀 Nevh Drama TS server on http://localhost:${port}`)

// Setelah restart proses, semua thread polling di memori hilang, tugas processing yang tersisa tidak akan pernah selesai,
// Saat startup ditandai sebagai failed secara seragam, untuk menghindari frontend terus menampilkan "sedang membuat"
db.update(schema.sysTask)
  .set({ status: 'failed', errorMsg: 'Server dimulai ulang, tugas pembuatan terputus, silakan coba lagi', updatedAt: now() })
  .where(eq(schema.sysTask.status, 'processing'))
  .then(res => {
    const affected = res?.changes ?? 0
    if (affected > 0) console.log(`🔁 Membersihkan ${affected} tugas pembuatan yang terputus`)
  })
  .catch(err => console.error('Gagal membersihkan tugas yang terputus:', err?.message))

// Job produksi lintas-episode yang sedang berjalan saat proses mati dianggap terputus (waiting_approval dipertahankan)
markInterruptedJobs().catch(err => console.error('Gagal menandai job produksi yang terputus:', err?.message))

// Multi-pengguna: buat akun admin default (admin/admin) + tetapkan drama lama tanpa pemilik ke admin, hapus sesi kedaluwarsa
seedDefaultAdmin().catch(err => console.error('Gagal menyiapkan akun admin default:', err?.message))
cleanupExpiredSessions().catch(() => {})

serve({ fetch: app.fetch, port })
