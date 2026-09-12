/** Penyimpanan token sesi (modul kecil terpisah agar bisa diimpor dari useApi tanpa siklus) */

export const AUTH_TOKEN_KEY = 'huobao:token'

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
  } catch { /* abaikan kegagalan penyimpanan */ }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch { /* abaikan */ }
}