import { useAuth } from '~/composables/useAuth'

/**
 * Tanpa halaman login: setiap navigasi memastikan ada sesi perangkat
 * (token lama divalidasi, sonst dibuat otomatis via /auth/device).
 * Rute /login & /register sudah dihapus — yang masih mengaksesnya diarahkan pulang.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { ensureDeviceSession } = useAuth()
  await ensureDeviceSession().catch(() => false)
  if (to.path === '/login' || to.path === '/register') {
    return navigateTo('/')
  }
})