/**
 * Ekstraksi frame poster video — untuk digunakan oleh <video poster>, menghindari buffering seluruh video di halaman daftar untuk menampilkan frame pertama
 */
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { getAbsolutePath } from './storage.js'
import { ffmpeg, checkFfmpegSuite, getFfmpegBinPath, getFfprobeBinPath } from './ffmpeg.js'

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

export interface ProbedMedia {
  duration: number
  hasVideo: boolean
  hasAudio: boolean
  width: number
  height: number
}

/** Probe presisi via ffprobe JSON (durasi float, stream video/audio, dimensi). */
export async function probeMedia(absPath: string): Promise<ProbedMedia | null> {
  const bin = getFfprobeBinPath()
  if (!bin) return null
  try {
    const out = await new Promise<string>((resolve, reject) => {
      let child
      try {
        child = spawn(bin, [
          '-v', 'error',
          '-show_entries', 'format=duration:stream=index,codec_type,width,height',
          '-of', 'json',
          absPath,
        ], { windowsHide: true })
      } catch (e) { reject(e); return }
      let stdout = ''
      child.stdout?.on('data', (d) => { stdout += String(d) })
      child.on('error', reject)
      child.on('close', (code) => { code === 0 ? resolve(stdout) : reject(new Error(`ffprobe exit ${code}`)) })
      setTimeout(() => { try { child.kill() } catch {} reject(new Error('ffprobe timeout')) }, 30_000)
    })
    const json = JSON.parse(out || '{}')
    const streams = Array.isArray(json?.streams) ? json.streams : []
    const v = streams.find((s: any) => s?.codec_type === 'video')
    return {
      duration: Number(json?.format?.duration) || 0,
      hasVideo: !!v,
      hasAudio: streams.some((s: any) => s?.codec_type === 'audio'),
      width: Number(v?.width) || 0,
      height: Number(v?.height) || 0,
    }
  } catch {
    return null
  }
}

export interface BlackEdges {
  /** Detik hitam/fade di awal klip (0 bila tidak ada) */
  lead: number
  /** Detik hitam/fade di akhir klip (0 bila tidak ada) */
  trail: number
  duration: number
}

const MAX_EDGE_TRIM_S = 2.0

/**
 * Deteksi fade hitam di ujung klip (penyebab utama "transisi fade" di tiap
 * sambungan: model video sering membuka dengan fade-in dari hitam dan menutup
 * dengan fade-out ke hitam). Mengembalikan durasi yang aman dipangkas.
 */
export async function detectBlackEdges(absPath: string): Promise<BlackEdges | null> {
  const bin = getFfmpegBinPath()
  if (!bin) return null
  try {
    const probed = await probeMedia(absPath)
    const duration = probed?.duration || 0
    if (!duration || duration <= 0.5) return null
    const stderr = await new Promise<string>((resolve, reject) => {
      let child
      try {
        child = spawn(bin, [
          '-hide_banner', '-i', absPath,
          '-vf', 'blackdetect=d=0.15:pic_th=0.985:pix_th=0.10',
          '-an', '-f', 'null', '-',
        ], { windowsHide: true })
      } catch (e) { reject(e); return }
      let err = ''
      child.stderr?.on('data', (d) => { err += String(d) })
      child.on('error', reject)
      child.on('close', () => resolve(err))
      setTimeout(() => { try { child.kill() } catch {} reject(new Error('blackdetect timeout')) }, 120_000)
    })
    let lead = 0
    let trail = 0
    for (const m of stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)) {
      const s = Number(m[1])
      const e = Number(m[2])
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue
      if (s <= 0.25) lead = Math.max(lead, e)           // segmen hitam menempel awal
      if (e >= duration - 0.25) trail = Math.max(trail, duration - s) // menempel akhir
    }
    lead = Math.min(Math.max(0, lead), MAX_EDGE_TRIM_S)
    trail = Math.min(Math.max(0, trail), MAX_EDGE_TRIM_S)
    if (lead + trail >= duration - 0.2) return { lead: 0, trail: 0, duration }
    return { lead, trail, duration }
  } catch (err) {
    console.warn(`[video-poster] blackdetect gagal ${absPath}:`, (err as Error).message)
    return null
  }
}

/**
 * Ekstrak frame terakhir "isi" video (melewati fade hitam di ekor) sebagai
 * gambar acuan shot berikutnya (chaining antar shot ala Pipit: aksi bersambung).
 * Mengembalikan path relatif (static/frames/...) atau null bila gagal.
 */
export async function extractVideoLastFrame(relativePath: string): Promise<string | null> {
  try {
    const { ffmpeg: ffmpegOk } = await checkFfmpegSuite()
    if (!ffmpegOk) return null
    const abs = getAbsolutePath(relativePath)
    if (!fs.existsSync(abs)) return null
    const edges = await detectBlackEdges(abs)
    const duration = edges?.duration || (await probeMedia(abs))?.duration || 0
    if (!duration || duration <= 0.5) return null
    const at = Math.max(0.1, duration - (edges?.trail || 0) - 0.15)
    const frameRel = `static/frames/chain-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`
    const frameAbs = getAbsolutePath(frameRel)
    fs.mkdirSync(path.dirname(frameAbs), { recursive: true })
    await new Promise<void>((resolve, reject) => {
      ffmpeg(abs)
        .screenshots({
          timestamps: [String(at)],
          filename: path.basename(frameAbs),
          folder: path.dirname(frameAbs),
          size: '768x?',
        })
        .on('end', () => resolve())
        .on('error', reject)
    })
    if (!fs.existsSync(frameAbs)) return null
    return frameRel
  } catch (err) {
    console.warn(`[video-poster] Gagal mengekstrak frame terakhir ${relativePath}:`, (err as Error).message)
    return null
  }
}
