import { getAuthToken } from '~/composables/useAuthToken'

/**
 * Pengawal global autentikasi:
 * - belum login → redirect ke /login (kecuali /login & /register)
 * - sudah login → tidak boleh membuka /login & /register (kembali ke beranda)
 */
export default defineNuxtRouteMiddleware((to) => {
  const publicPages = ['/login', '/register']
  const hasToken = !!getAuthToken()

  if (!hasToken && !publicPages.includes(to.path)) {
    return navigateTo('/login')
  }
  if (hasToken && publicPages.includes(to.path)) {
    return navigateTo('/')
  }
})