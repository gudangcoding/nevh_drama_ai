/**
 * Ekstraksi frame poster video — untuk digunakan oleh <video poster>, menghindari buffering seluruh video di halaman daftar untuk menampilkan frame pertama
 */
import path from 'path'
import { getAbsolutePath } from './storage.js'
import { ffmpeg, checkFfmpegSuite } from './ffmpeg.js'

/** Menurunkan path frame poster dari path relatif video: static/videos/x.mp4 → static/videos/x_poster.jpg */
export function posterPathFor(relativePath: string): string {
  return relativePath.replace(/\.[^./]+$/, '_poster.jpg')
}

/**
 * Mengekstrak frame pada 0.5 detik video sebagai frame poster (lebar 640, proporsional, direktori yang sama dengan video asli).
 * Jika gagal mengembalikan null, tidak memblokir alur utama.
 */
export async function extractVideoPoster(relativePath: string): Promise<string | null> {
  try {
    // Biner ffmpeg rusak (salinan lintas platform node_modules / unduhan tidak lengkap) dilewati secara diam-diam,
    // menghindari EFTYPE sinkron di callback terlambat fluent-ffmpeg yang dapat crash seluruh proses
    const { ffmpeg: ffmpegOk } = await checkFfmpegSuite()
    if (!ffmpegOk) return null

    const posterRel = posterPathFor(relativePath)
    const posterAbs = getAbsolutePath(posterRel)
    await new Promise<void>((resolve, reject) => {
      ffmpeg(getAbsolutePath(relativePath))
        .screenshots({
          timestamps: ['0.5'],
          filename: path.basename(posterAbs),
          folder: path.dirname(posterAbs),
          size: '640x?',
        })
        .on('end', () => resolve())
        .on('error', reject)
    })
    return posterRel
  } catch (err) {
    console.warn(`[video-poster] Gagal mengekstrak frame poster ${relativePath}:`, (err as Error).message)
    return null
  }
}
