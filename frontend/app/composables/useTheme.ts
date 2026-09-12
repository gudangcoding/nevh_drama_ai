/**
 * Mode tema (singleton tingkat modul)
 * - Sejajar dengan i18n.ts: ssr:false, membaca localStorage di level modul aman
 * - Level modul menulis <html data-theme> secara sinkron, berjalan sebelum frame pertama, hindari flicker gelap/terang
 *   (tidak bisa menggunakan app.vue onMounted — setelah frame pertama baru jalankan pasti flicker)
 * - Mengikuti sistem: matchMedia('(prefers-color-scheme: dark)'), Web/desktop (Electron
 *   default nativeTheme.themeSource='system') umum, tidak membutuhkan jembatan desktop
 */
import { computed, readonly, ref, watch, type ComputedRef } from 'vue'

export const THEME_STORAGE_KEY = 'huobao:theme'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system']

export function readStoredThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v && (THEME_MODES as string[]).includes(v)) return v as ThemeMode
  } catch { /* localStorage tidak tersedia, kembali ke default */ }
  return 'system'
}

export function persistThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch { /* abaikan kegagalan persistensi */ }
}

const themeMode = ref<ThemeMode>(readStoredThemeMode())
const systemDark = ref(false)

export const resolvedTheme: ComputedRef<ResolvedTheme> = computed(() =>
  themeMode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : themeMode.value,
)

function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme.value
}

if (typeof window !== 'undefined') {
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mql.matches
  applyTheme()
  mql.addEventListener('change', (e) => {
    systemDark.value = e.matches
    applyTheme()
  })
  watch(themeMode, applyTheme)
}

/** Ganti mode tema dan persistenkan (kartu tampilan halaman pengaturan dan ThemeToggle menggunakan yang sama) */
export function setThemeMode(mode: ThemeMode) {
  themeMode.value = mode
  persistThemeMode(mode)
}

/** light → dark → system loop (digunakan oleh tombol pintas di header) */
export function cycleThemeMode() {
  const i = THEME_MODES.indexOf(themeMode.value)
  setThemeMode(THEME_MODES[(i + 1) % THEME_MODES.length])
}

export function useTheme() {
  return {
    themeMode: readonly(themeMode),
    resolvedTheme,
    setThemeMode,
    cycleThemeMode,
  }
}
