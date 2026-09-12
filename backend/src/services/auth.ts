import crypto from 'crypto'
import { eq, isNull, lt } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { now } from '../utils/response.js'

export type AuthUser = { id: number; username: string; role: 'user' | 'admin' }

export const USERNAME_MIN = 3
export const USERNAME_MAX = 32
export const PASSWORD_MIN = 6
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 hari

const SCRYPT_KEYLEN = 64
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 }

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, SCRYPT_OPTS, (err, derived) => err ? reject(err) : resolve(derived))
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scryptAsync(password, salt, expected.length)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function isUsernameValid(username: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(username) && username.length >= USERNAME_MIN && username.length <= USERNAME_MAX
}

export async function getUserByUsername(username: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username))
  return user || null
}

function toAuthUser(user: typeof schema.users.$inferSelect): AuthUser {
  return { id: user.id, username: user.username, role: user.role as AuthUser['role'] }
}

export async function createSession(userId: number): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await db.insert(schema.sessions).values({ userId, token, expiresAt, createdAt: now() })
  return token
}

export async function getUserByToken(token: string): Promise<AuthUser | null> {
  const [sessionRow] = await db.select().from(schema.sessions)
    .where(eq(schema.sessions.token, token))
  if (!sessionRow) return null
  if (new Date(sessionRow.expiresAt).getTime() <= Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionRow.id)).catch(() => {})
    return null
  }
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, sessionRow.userId))
  if (!user) return null
  return toAuthUser(user)
}

export async function deleteSessionByToken(token: string): Promise<void> {
  if (!token) return
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token)).catch(() => {})
}

// Bersihkan sesi yang sudah kedaluwarsa (dipanggil saat startup)
export async function cleanupExpiredSessions(): Promise<void> {
  await db.delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, now()))
    .catch(() => {})
}

export async function registerUser(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const ts = now()
  const passwordHash = await hashPassword(password)
  const res = await db.insert(schema.users).values({
    username,
    role: 'user',
    passwordHash,
    createdAt: ts,
    updatedAt: ts,
  })
  const userId = getInsertId(res)
  const token = await createSession(userId)
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId))
  return { token, user: toAuthUser(row) }
}

export async function loginUser(username: string, password: string): Promise<{ token: string; user: AuthUser } | null> {
  const user = await getUserByUsername(username)
  if (!user) return null
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return null
  const token = await createSession(user.id)
  return { token, user: toAuthUser(user) }
}

export async function seedDefaultAdmin(): Promise<void> {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.username, 'admin'))
  let adminId: number
  if (existing) {
    adminId = existing.id
  } else {
    const passwordHash = await hashPassword('admin')
    const ts = now()
    const res = await db.insert(schema.users).values({
      username: 'admin',
      role: 'admin',
      passwordHash,
      createdAt: ts,
      updatedAt: ts,
    })
    adminId = getInsertId(res)
    console.log('👑 Akun admin default dibuat — username: admin / password: admin')
  }
  // Drama lama tanpa pemilik ditetapkan ke admin agar tetap terlihat (drama tanpa user_id akan hilang dari daftar user biasa)
  const orphans = await db.select().from(schema.dramas).where(isNull(schema.dramas.userId))
  if (orphans.length) {
    for (const d of orphans) {
      await db.update(schema.dramas).set({ userId: adminId, updatedAt: now() }).where(eq(schema.dramas.id, d.id))
    }
    console.log(`🗂️ ${orphans.length} drama lama ditetapkan ke akun admin`)
  }
}