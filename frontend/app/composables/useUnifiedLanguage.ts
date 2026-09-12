/**
 * Peralihan bahasa terpadu: bahasa UI = bahasa konten AI, satu saklar yang sama.
 *
 * Dua titik masuk (LocaleSwitcher bilah atas / tab umum halaman pengaturan) sama-sama melalui confirmUnifiedLanguage:
 * 1. Tampilkan konfirmasi dialog terpisah (dicolokkan ke body, jelaskan dampak: antarmuka + konten AI + segarkan)
 * 2. Setelah dikonfirmasi: tulis ke backend content_language → ganti vue-i18n locale → ringkas toast → location.reload()
 *    (Muat ulang seluruh halaman agar semua komponen dibangun k bersih, menghindari masalah urutan watch pada komponen yang dalam)
 */
import { createApp, h, ref } from 'vue'
import { i18n, setUiLocale, type UiLocale } from '~/composables/i18n'
import { settingsAPI } from '~/composables/useApi'
import LanguageSwitchDialog from '~/components/LanguageSwitchDialog.vue'

let pending: { resolve: (ok: boolean) => void } | null = null

/** Tampilkan dialog konfirmasi; resolve(true) = pengguna mengonfirmasi peralihan */
function confirmDialog(lang: UiLocale): Promise<boolean> {
  return new Promise((resolve) => {
    const langNameKeys = { zh: 'langNameZh', en: 'langNameEn', ja: 'langNameJa', ko: 'langNameKo', id: 'langNameId' }
    const nameKey = `settings.general.${langNameKeys[lang] || 'langNameZh'}`
    const title = i18n.global.t('components.langSwitch.title', { lang: i18n.global.t(nameKey) })
    const message = i18n.global.t('components.langSwitch.message')

    const open = ref(true)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      setup: () => () => h(LanguageSwitchDialog, {
        open: open.value,
        title,
        message,
        onConfirm: () => { open.value = false },
        onCancel: () => { open.value = false },
      }),
    })
    app.use(i18n as unknown as Parameters<typeof app.use>[0])
    app.mount(host)

    pending = {
      resolve: (ok) => {
        app.unmount()
        host.remove()
        resolve(ok)
      },
    }
    // open diatur false kemudian ditutup oleh watch dan resolve — menggunakan polling sederhana (ukuran dialog kecil, tidak sepadan mengimpor watch rumit)
    const timer = setInterval(() => {
      if (!open.value) {
        clearInterval(timer)
        pending?.resolve(true)
        pending = null
      }
    }, 80)
  })
}

let switching = false

/** Masuk: tampilkan dialog konfirmasi dulu, setelah dikonfirmasi jalankan peralihan terpadu dan segarkan */
export async function confirmUnifiedLanguage(lang: UiLocale) {
  if (switching) return
  const ok = await confirmDialog(lang)
  if (!ok) return
  switching = true
  try {
    await settingsAPI.setContentLanguage(lang)
  } catch { /* kegagalan backend tidak memblokir peralihan antarmuka */ }
  setUiLocale(lang)
  try {
    const { toast } = await import('vue-sonner')
    toast.info(i18n.global.t('components.langSwitch.refreshing'), { duration: 1200 })
  } catch { /* kegagalan toast tidak memblokir */ }
  setTimeout(() => location.reload(), 1000)
}
