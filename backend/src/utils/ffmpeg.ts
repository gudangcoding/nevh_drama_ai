/**
 * Konfigurasi FFmpeg terpadu dan deteksi ketersediaan
 *
 * Latar belakang: Di Windows, jika node_modules disalin lintas platform, atau ffmpeg-static postinstall
 * mengunduh file rusak (halaman error HTML disimpan sebagai ffmpeg.exe), spawn file non-PE akan melempar
 * EFTYPE secara sinkron; pengecualian ini terjadi di callback terlambat fluent-ffmpeg, try/catch luar tidak bisa menangkap,
 * langsung crash seluruh proses Node. Di sini sebelum pemanggilan bisnis secara aktif spawn -version untuk deteksi,
 * jika tidak tersedia, sisi bisnis melakukan degradasi gracefully (frame poster dilewati / penggabungan mengembalikan error yang jelas).
 */
import { spawn } from 'child_process'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import { createRequire } from 'module'

// ffmpeg-static / ffprobe-static keduanya adalah dependensi opsional: npm install menyediakan biner bawaan;
// Versi desktop tidak menyertakan dua paket npm ini (biner didistribusikan bersama resources/bin), jika hilang gunakan FFMPEG_BIN/FFPROBE_BIN
const req = createRequire(import.meta.url)

function resolveStatic(moduleName: string): string | null {
  try {
    const mod = req(moduleName)
    return (moduleName === 'ffprobe-static' ? mod?.path : mod) ?? null
  } catch {
    return null
  }
}

const ffmpegPath = process.env.FFMPEG_BIN || resolveStatic('ffmpeg-static')
const ffprobePath = process.env.FFPROBE_BIN || resolveStatic('ffprobe-static')

// Menggunakan biner bawaan proyek saat sistem tidak menginstal ffmpeg
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath)

export { ffmpeg }

/** spawn -version sekali untuk memverifikasi biner benar-benar dapat dieksekusi (termasuk penanganan sinkron EFTYPE) */
function probeBinary(binPath: string | null): Promise<boolean> {
  if (!binPath || !fs.existsSync(binPath)) return Promise.resolve(false)
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => finish(false), 10_000)
    let child
    try {
      child = spawn(binPath, ['-version'], { stdio: 'ignore', windowsHide: true })
    } catch {
      // Di Windows, spawn file non-PE (seperti ffmpeg.exe yang rusak dari unduhan) akan melempar EFTYPE secara sinkron
      finish(false)
      return
    }
    child.on('error', () => finish(false))
    child.on('close', (code) => finish(code === 0))
  })
}

export interface FfmpegSuite {
  ffmpeg: boolean
  ffprobe: boolean
}

// Cache hasil deteksi yang berhasil (hanya sekali per proses); kegagalan tidak di-cache, setelah memperbaiki biner dapat pulih tanpa restart
let okCache: FfmpegSuite | null = null
let warned = false

/** Mendeteksi apakah ffmpeg/ffprobe bawaan tersedia */
export async function checkFfmpegSuite(): Promise<FfmpegSuite> {
  if (okCache) return okCache
  const [ffmpegOk, ffprobeOk] = await Promise.all([probeBinary(ffmpegPath), probeBinary(ffprobePath)])
  const suite = { ffmpeg: ffmpegOk, ffprobe: ffprobeOk }
  if (ffmpegOk && ffprobeOk) {
    okCache = suite
  } else if (!warned) {
    warned = true
    console.warn(
      `[ffmpeg] Binary bawaan tidak tersedia (ffmpeg=${ffmpegOk ? 'ok' : 'FAIL'}, ffprobe=${ffprobeOk ? 'ok' : 'FAIL'})。` +
      `Ekstraksi frame poster dan penggabungan video akan dilewati/gagal. Perbaikan: hapus node_modules lalu jalankan npm install ulang di mesin ini, ` +
      `atau set FFMPEG_BIN/FFPROBE_BIN ke executable yang valid`
    )
  }
  return suite
}
