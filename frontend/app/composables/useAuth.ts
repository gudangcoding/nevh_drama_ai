import { api } from './useApi'
import { getAuthToken, setAuthToken, clearAuthToken } from './useAuthToken'

export type AuthUser = { id: number; username: string; role: 'user' | 'admin' }

/**
 * Manajemen sesi pengguna (login/logout/profil).
 * Token disimpan di localStorage; status user disimpan di useState agar reaktif di semua komponen.
 */
export function useAuth() {
  const user = useState<AuthUser | null>('auth:user', () => null)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isLoggedIn = computed(() => !!user.value || !!getAuthToken())

  async function login(username: string, password: string) {
    const res = await api.post<{ token: string; user: AuthUser }>('/auth/login', { username, password })
    setAuthToken(res.token)
    user.value = res.user
  }

  async function register(username: string, password: string) {
    const res = await api.post<{ token: string; user: AuthUser }>('/auth/register', { username, password })
    setAuthToken(res.token)
    user.value = res.user
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } catch { /* token mungkin sudah tidak valid, tetap bersihkan lokal */ }
    clearAuthToken()
    user.value = null
  }

  /** Memulihkan sesi saat muat ulang halaman: validasi token via /auth/me */
  async function restoreSession(): Promise<boolean> {
    if (!getAuthToken()) return false
    try {
      user.value = await api.get<AuthUser>('/auth/me')
      return true
    } catch {
      clearAuthToken()
      user.value = null
      return false
    }
  }

  /** Perbarui profil (username) akun yang sedang masuk */
  async function updateProfile(username: string): Promise<AuthUser> {
    const updated = await api.put<AuthUser>('/auth/me', { username })
    user.value = updated
    return updated
  }

  /** Ganti kata sandi akun yang sedang masuk */
  async function changePassword(oldPassword: string, newPassword: string) {
    await api.put('/auth/password', { old_password: oldPassword, new_password: newPassword })
  }

  return { user, isAdmin, isLoggedIn, login, register, logout, restoreSession, updateProfile, changePassword }
}