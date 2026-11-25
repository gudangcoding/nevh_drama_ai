import { Hono } from 'hono'
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { requireAuth } from '../middleware/auth.js'
import { getUser } from '../services/ownership.js'
import {
  isUsernameValid,
  loginUser,
  registerUser,
  createSession,
  deleteSessionByToken,
  hashPassword,
  verifyPassword,
  USERNAME_MIN,
  PASSWORD_MIN,
} from '../services/auth.js'
import { now } from '../utils/response.js'

const app = new Hono()

// POST /auth/device — sesi otomatis tanpa login (KHUSUS aplikasi desktop).
// Mengembalikan token untuk akun tertua di perangkat ini (instalasi lama tetap
// membuka data miliknya; instalasi baru memakai akun admin default). Di luar
// desktop (HUOBAO_DESKTOP!=1) endpoint ini mati agar tidak menjadi celah.
app.post('/device', async (c) => {
  if (process.env.HUOBAO_DESKTOP !== '1') return badRequest(c, 'Mode tanpa login hanya tersedia di aplikasi desktop')
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.id))
  const user = users[0]
  if (!user) return badRequest(c, 'Belum ada akun di perangkat ini')
  const token = await createSession(user.id)
  return success(c, { token, user: { id: user.id, username: user.username, role: user.role } })
})

// POST /auth/register — mendaftar akun user biasa (role 'user'), langsung auto-login
app.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  const password = String(body.password || '')

  if (!isUsernameValid(username)) {
    return badRequest(c, `Username harus ${USERNAME_MIN}-32 karakter dan hanya boleh berisi huruf/angka/_.-`)
  }
  if (password.length < PASSWORD_MIN) {
    return badRequest(c, `Kata sandi minimal ${PASSWORD_MIN} karakter`)
  }

  const existing = await db.select().from(schema.users).where(eq(schema.users.username, username))
  if (existing.length) return badRequest(c, 'Username sudah digunakan, silakan pilih username lain')

  try {
    const { token, user } = await registerUser(username, password)
    return success(c, { token, user })
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE')) return badRequest(c, 'Username sudah digunakan, silakan pilih username lain')
    console.error('[POST /auth/register] gagal:', err)
    return badRequest(c, 'Gagal membuat akun, silakan coba lagi')
  }
})

// POST /auth/login — masuk, mengembalikan token sesi
app.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  const result = await loginUser(username, password)
  if (!result) return badRequest(c, 'Username atau kata sandi salah')
  return success(c, { token: result.token, user: result.user })
})

// POST /auth/logout — menonaktifkan sesi saat ini (token dibaca dari header)
app.post('/logout', async (c) => {
  const header = (c.req.header('Authorization') || '').trim()
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  await deleteSessionByToken(token)
  return success(c)
})

// GET /auth/me — profil user yang sedang masuk (dilindungi)
app.get('/me', requireAuth, async (c) => {
  const user = getUser(c)
  return success(c, user)
})

// PUT /auth/me — perbarui profil (username) akun yang sedang masuk (dilindungi)
app.put('/me', requireAuth, async (c) => {
  const user = getUser(c)
  const body = await c.req.json().catch(() => ({}))
  const username = String(body.username || '').trim()

  if (!isUsernameValid(username)) {
    return badRequest(c, `Username harus ${USERNAME_MIN}-32 karakter dan hanya boleh berisi huruf/angka/_.-`)
  }
  if (username !== user.username) {
    const existing = await db.select().from(schema.users).where(eq(schema.users.username, username))
    if (existing.length) return badRequest(c, 'Username sudah digunakan, silakan pilih username lain')
  }
  await db.update(schema.users).set({ username, updatedAt: now() }).where(eq(schema.users.id, user.id))
  return success(c, { id: user.id, username, role: user.role })
})

// PUT /auth/password — ganti kata sandi akun yang sedang masuk (dilindungi)
app.put('/password', requireAuth, async (c) => {
  const user = getUser(c)
  const body = await c.req.json().catch(() => ({}))
  const oldPassword = String(body.old_password || '')
  const newPassword = String(body.new_password || '')

  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id))
  if (!row) return badRequest(c, 'Akun tidak ditemukan')
  const ok = await verifyPassword(oldPassword, row.passwordHash)
  if (!ok) return badRequest(c, 'Kata sandi lama salah')

  if (newPassword.length < PASSWORD_MIN) {
    return badRequest(c, `Kata sandi baru minimal ${PASSWORD_MIN} karakter`)
  }
  const passwordHash = await hashPassword(newPassword)
  await db.update(schema.users).set({ passwordHash, updatedAt: now() }).where(eq(schema.users.id, user.id))
  return success(c)
})

export default app