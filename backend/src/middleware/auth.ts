import type { MiddlewareHandler } from 'hono'
import { getUserByToken } from '../services/auth.js'

/**
 * Middleware autentikasi — memvalidasi `Authorization: Bearer <token>` dan
 * menyimpan { user, token } ke dalam konteks Hono untuk handler selanjutnya.
 * Kegagalan melempar error { status: 401 } yang ditangkap oleh errorHandler global.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = (c.req.header('Authorization') || '').trim()
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw { status: 401, message: 'Silakan masuk terlebih dahulu' }

  const user = await getUserByToken(token)
  if (!user) throw { status: 401, message: 'Sesi telah berakhir, silakan masuk kembali' }

  ;(c.set as (key: string, value: unknown) => void)('user', user)
  ;(c.set as (key: string, value: unknown) => void)('token', token)
  await next()
}