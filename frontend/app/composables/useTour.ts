/**
 * Panduan tur dalam aplikasi (driver.js) — solusi ringan
 *
 * - Setiap halaman mendefinisikan langkah (selector + kunci teks i18n), diaktifkan melalui startTour()
 * - Tanda "sudah dilihat" disimpan per tour id di localStorage (huobao:tours), otomatis muncul saat pertama kali,
 *   tombol bantuan dapat menonton ulang kapan saja; lewati/selesaiboth dihitung sebagai sudah dilihat
 * - Gaya tema mengikuti token desain (accent oranye api), lihat override .driver-theme di app.vue
 */
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const SEEN_KEY = 'huobao:tours'

function readSeen(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') } catch { return [] }
}

export function tourSeen(id: string): boolean {
  return readSeen().includes(id)
}

export function markTourSeen(id: string) {
  const seen = readSeen()
  if (!seen.includes(id)) {
    seen.push(id)
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  }
}

export interface TourStep {
  element: string            // CSS selector; '#__nuxt' sebagai fallback berarti popup tengah (tanpa highlight)
  titleKey: string           // i18n key
  descKey: string            // i18n key
  popoverSide?: 'top' | 'bottom' | 'left' | 'right'
  popoverAlign?: 'start' | 'center' | 'end'
}

/**
 * Mulai sebuah tur. t adalah fungsi terjemahan useI18n.
 * Mengembalikan apakah benar-benar diaktifkan (elemen tidak ada atau langkah kosong dilewati secara diam-diam).
 */
export function startTour(id: string, steps: TourStep[], t: (key: string) => string): boolean {
  const usable = steps.filter(s => s.element === '#__nuxt' || document.querySelector(s.element))
  if (!usable.length) return false

  const drv = driver({
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'nextStep',
    popoverClass: 'huobao-tour-popover',
    progressText: '{{current}} / {{total}}',
    nextBtnText: t('tour.next'),
    prevBtnText: t('tour.prev'),
    doneBtnText: t('tour.done'),
    onDestroyed: () => markTourSeen(id),
    steps: usable.map(s => ({
      element: s.element,
      popover: {
        title: t(s.titleKey),
        description: t(s.descKey),
        side: s.popoverSide || 'bottom',
        align: s.popoverAlign || 'start',
      },
    })),
  })
  drv.drive()
  return true
}

/** Pandu otomatis saat pertama kali masuk: jika sudah dilihat atau elemen belum siap, lewati.
 *  Tandai sebagai sudah dilihat segera saat dimulai agar tidak muncul lagi di kunjungan berikutnya
 *  (bahkan jika pengguna navigasi keluar sebelum tur selesai). */
export function autoTour(id: string, steps: TourStep[], t: (key: string) => string) {
  if (tourSeen(id)) return
  markTourSeen(id)
  startTour(id, steps, t)
}
