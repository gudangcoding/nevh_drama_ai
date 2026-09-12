/**
 * Bantuan alamat media — daftar/kartu menggunakan thumbnail dan poster frame, preview gambar besar masih menggunakan gambar asli
 *
 * Konvensi penamaan (dihasilkan secara otomatis saat produksi backend, lihat backend/src/utils/storage.ts, video-poster.ts):
 *   Gambar static/images/x.png      → thumbnail static/images/x_thumb.webp
 *   Video static/videos|merged/x.mp4 → poster frame static/videos|merged/x_poster.jpg
 * File yang ada bisa diisi menggunakan `npm run backfill-artwork` (backend).
 */

/** Alamat gambar → alamat thumbnail; gambar non-/static/ (URL remote dll) dikembalikan apa adanya */
export function thumbOf(url: string): string {
  if (!url || !url.includes('/static/')) return url
  if (!/\.(png|jpe?g|webp|gif)$/i.test(url)) return url
  return url.replace(/\.[^./]+$/, '_thumb.webp')
}

/** Gagal memuat thumbnail (data lama belum diisi) kembali ke gambar asli */
export function thumbFallback(e: Event, orig: string) {
  const el = e.target as HTMLImageElement
  if (!el || el.dataset.fbk || !orig) return
  el.dataset.fbk = '1'
  el.src = orig
}

/** Alamat video → alamat poster frame; tidak dapat diturunkan (URL remote dll) mengembalikan string kosong, tidak mengatur poster */
export function posterOf(url: string): string {
  if (!url || !url.includes('/static/')) return ''
  if (!/\.(mp4|webm|mov)$/i.test(url)) return ''
  return url.replace(/\.[^./]+$/, '_poster.jpg')
}
