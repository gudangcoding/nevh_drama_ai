/**
 * Contoh i18n (singleton tingkat modul)
 * - Contoh ditempatkan di modul terpisah bukan di dalam plugin: code di luar setup seperti useAgent/useMigrateState
 *   perlu `import { i18n }` dan menggunakan i18n.global.t secara langsung
 * - ssr:false, membaca localStorage di level modul aman; preferensi bahasa UI dipersistenkan di huobao:locale
 * - legacy:false harus eksplisit, jika tidak global.locale bukan ref dan tidak bisa diubah secara runtime
 */
import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import ko from '../locales/ko.json'
import id from '../locales/id.json'

export const LOCALE_STORAGE_KEY = 'huobao:locale'

export type UiLocale = 'en' | 'ko' | 'id'

export const UI_LOCALES: Array<{ value: UiLocale; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'id', label: 'Bahasa Indonesia' },
]

export function readStoredLocale(): UiLocale {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (v && UI_LOCALES.some(l => l.value === v)) return v as UiLocale
  } catch { /* localStorage tidak tersedia, kembali ke default */ }
  return 'id'
}

export function persistLocale(locale: UiLocale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch { /* abaikan kegagalan persistensi */ }
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: 'id',
  messages: { en, ko, id },
  missingWarn: false,
  fallbackWarn: false,
})

/** Ganti bahasa UI dan persistenkan (LocaleSwitcher dan inisialisasi menggunakan fungsi yang sama) */
export function setUiLocale(locale: UiLocale) {
  i18n.global.locale.value = locale
  persistLocale(locale)
}
