/**
 * FFmpeg multi-shot merging — menggabungkan semua video shot yang sudah dihasilkan menjadi satu episode
 *
 * Pilihan subtitle: saat subtitles=true, file SRT dibangun dari deskripsi storyboard lalu dibakar
 * ke video gabungan via filter libass `subtitles`. Font dipilih berdasarkan bahasa konten
 * (Arial untuk Latin/Indonesia; Microsoft YaHei untuk CJK; fallback ke arial).
 */
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { db, getInsertId, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { translateApiError } from '../utils/error-translate.js'
import { extractVideoPoster, posterPathFor, probeMedia, detectBlackEdges } from '../utils/video-poster.js'
import { getAbsolutePath } from '../utils/storage.js'
import sharp from 'sharp'
import { ffmpeg, checkFfmpegSuite } from '../utils/ffmpeg.js'
import { DATA_ROOT, STORAGE_ROOT } from '../utils/paths.js'
import { getContentLanguage, type ContentLanguage } from './app-settings.js'
import { buildEpisodeSrt } from './subtitles.js'

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

/** Font untuk subtitle per bahasa — tersedia di Windows di C:/Windows/Fonts */
const SUBTITLE_FONTS: Record<string, string> = {
  id: 'Arial',
  en: 'Arial',
  zh: 'Microsoft YaHei',
  ja: 'Yu Gothic',
  ko: 'Malgun Gothic',
}

/**
 * Menggabungkan video shot untuk satu episode.
 * Menggunakan hasil generasi video secara prioritas, kompatibel dengan data composedVideoUrl historis.
 * Saat storyboardIds dimasukkan hanya menggabungkan shot yang dipilih (tetap berurutan berdasarkan nomor shot).
 * Opsi subtitles: bakar dialog ke video gabungan (default true untuk bahasa non-zh).
 */
export async function mergeEpisodeVideos(
  episodeId: number,
  dramaId: number,
  storyboardIds?: number[],
  opts: { subtitles?: boolean } = {},
): Promise<number> {
  let storyboards = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)

  if (storyboardIds?.length) {
    const allow = new Set(storyboardIds.map(Number))
    storyboards = storyboards.filter(sb => allow.has(sb.id))
  }

  // Mengizinkan penggabungan parsial: menggabungkan shot yang sudah dihasilkan berdasarkan nomor shot, shot yang belum dihasilkan dilewati
  const clips = storyboards
    .map(sb => ({ sb, url: sb.videoUrl || sb.composedVideoUrl }))
    .filter(c => Boolean(c.url)) as { sb: typeof storyboards[number]; url: string }[]

  if (clips.length === 0) throw new Error('Shot yang dipilih belum memiliki video yang dapat digabungkan')

  // Mendeteksi ffmpeg sebelum penggabungan: saat biner rusak, EFTYPE sinkron dari fluent-ffmpeg akan membuat seluruh proses crash,
  // di sini dicegah terlebih dahulu dan diberikan panduan perbaikan yang dapat ditindaklanjuti (layer route akan mengembalikan 400 ke frontend)
  const suite = await checkFfmpegSuite()
  if (!suite.ffmpeg || !suite.ffprobe) {
    throw new Error('ffmpeg di mesin ini tidak tersedia, tidak dapat menggabungkan video (biasanya terjadi karena copy node_modules lintas platform atau download ffmpeg-static yang rusak). Silakan hapus node_modules lalu jalankan npm install kembali di mesin ini, atau set FFMPEG_BIN ke file executable ffmpeg yang valid lalu restart layanan')
  }

  // Memvalidasi keberadaan file video secara nyata: video_url di DB mungkin menunjuk ke file yang sudah dibersihkan,
  // jika digabungkan langsung akan mendapatkan error ffmpeg "No such file or directory" yang membingungkan
  const missing = clips.filter(c => !fs.existsSync(toAbsPath(c.url)))
  if (missing.length > 0) {
    const nums = missing.map(c => `S${c.sb.storyboardNumber}`).join('、')
    throw new Error(`Video shot ${nums} telah hilang (file lokal tidak ada), silakan buat ulang video shot-shot ini, atau batalkan pilihan saat penggabungan`)
  }

  const videos = clips.map(c => c.url)

  logTaskStart('MergeTask', 'episode-merge', { episodeId, dramaId, clips: videos.length })

  // Membuat catatan merge
  const ts = now()
  const res = await db.insert(schema.videoMerges).values({
    episodeId,
    dramaId,
    title: `Episode ${episodeId} Merge`,
    provider: 'ffmpeg',
    model: 'ffmpeg-concat-h264-aac',
    status: 'processing',
    scenes: JSON.stringify(videos),
    createdAt: ts,
  })
  const mergeId = getInsertId(res)

  // Eksekusi asinkron
  doMerge(mergeId, episodeId, videos, opts.subtitles !== false).catch(async err => {
    logTaskError('MergeTask', 'episode-merge', { mergeId, episodeId, error: err.message })
    console.error(`[Merge] Failed:`, err)
    await db.update(schema.videoMerges)
      .set({ status: 'failed', errorMsg: translateApiError(err.message) })
      .where(eq(schema.videoMerges.id, mergeId))
  })

  return mergeId
}

async function doMerge(mergeId: number, episodeId: number, videos: string[], subtitlesEnabled: boolean) {
  // ── Rencana trim: pangkas fade hitam di ujung tiap klip ───────────────────
  // Model video sering membuka dengan fade-in dari hitam & menutup dengan fade-out
  // ke hitam; tanpa dipangkas, tiap sambungan terlihat seperti "transisi fade" yang
  // tidak natural. Di sini segmen hitam tepi dideteksi (blackdetect) lalu dipangkas
  // sebelum concat, sehingga sambungan menjadi hard cut yang bersih.
  interface ClipPlan { abs: string; start: number; end: number; hasAudio: boolean }
  const plans: ClipPlan[] = []
  for (const v of videos) {
    const abs = toAbsPath(v)
    const probed = await probeMedia(abs).catch(() => null)
    const dur = probed?.duration || 0
    let start = 0
    let end = dur > 0 ? dur : 86400
    if (dur > 0.5) {
      const edges = await detectBlackEdges(abs).catch(() => null)
      if (edges && (edges.lead > 0 || edges.trail > 0)) {
        start = edges.lead
        end = Math.max(start + 0.2, edges.duration - edges.trail)
        logTaskStart('MergeTask', 'trim-fade', { clip: v, lead: edges.lead, trail: edges.trail })
      }
    }
    plans.push({ abs, start, end, hasAudio: !!probed?.hasAudio })
  }
  // Normalisasi dimensi ke klip pertama (concat filter menuntut ukuran seragam)
  const firstProbe = await probeMedia(plans[0].abs).catch(() => null)
  const normW = firstProbe?.width || 1280
  const normH = firstProbe?.height || 720

  // ── Bangun SRT subtitle dengan durasi SETELAH trim (timing tetap sinkron) ──
  let srtPath: string | null = null
  if (subtitlesEnabled) {
    const lang = getContentLanguage()
    srtPath = await buildEpisodeSrt({
      episodeId, lang, clipFiles: videos, storageRoot: STORAGE_ROOT,
      clipDurations: plans.map(p => Math.max(0.2, p.end - p.start)),
    }).catch(() => null)
  }

  // File output
  const outputDir = path.join(STORAGE_ROOT, 'merged')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  // ── filter_complex: trim + normalisasi per klip → concat → subtitle ───────
  const filters: string[] = []
  plans.forEach((p, i) => {
    const s = p.start.toFixed(3)
    const e = p.end.toFixed(3)
    filters.push(
      `[${i}:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS,scale=${normW}:${normH},setsar=1,fps=30,format=yuv420p[v${i}]`,
    )
    if (p.hasAudio) {
      filters.push(`[${i}:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a${i}]`)
    } else {
      filters.push(`anullsrc=r=48000:cl=stereo:d=${Math.max(0.2, p.end - p.start).toFixed(3)}[a${i}]`)
    }
  })
  filters.push(`${plans.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${plans.length}:v=1:a=1[outv][outa]`)
  let videoMap = '[outv]'
  if (srtPath && fs.existsSync(srtPath)) {
    const lang = getContentLanguage()
    const fontName = SUBTITLE_FONTS[lang] || 'Arial'
    // Escaping path untuk filter syntax: backslash → forward slash, colon → \:
    const escapedPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')
    filters.push(`[outv]subtitles='${escapedPath}':force_style='FontName=${fontName},FontSize=22,Outline=1,Shadow=1,MarginV=20'[vout]`)
    videoMap = '[vout]'
  }

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg()
    for (const p of plans) cmd.input(p.abs)
    cmd.complexFilter(filters, [videoMap, '[outa]'])
      .outputOptions([
        '-fflags', '+genpts',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-ar', '48000',
        '-b:a', '192k',
        '-movflags', '+faststart',
      ])

    cmd.output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })

  // Membersihkan file sementara
  if (srtPath && fs.existsSync(srtPath)) {
    try { fs.unlinkSync(srtPath) } catch { /* abaikan */ }
  }

  // Mengambil durasi
  const duration = await getVideoDuration(outputPath)

  const mergedRelative = `static/merged/${outputFilename}`

  // Frame poster hasil akhir (untuk sampul halaman ekspor)
  await extractVideoPoster(mergedRelative)
  // Sampul hasil akhir = sampul proyek (jika ada); timpa poster frame agar cover proyek muncul di hasil export
  const [episode] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  const posterRel = posterPathFor(mergedRelative)
  let coverPoster: string | null = null
  if (episode) coverPoster = await applyDramaCoverAsPoster(episode.dramaId, mergedRelative)

  // Memperbarui catatan merge
  await db.update(schema.videoMerges)
    .set({ status: 'completed', mergedUrl: mergedRelative, duration, completedAt: now() })
    .where(eq(schema.videoMerges.id, mergeId))

  // Memperbarui episode
  await db.update(schema.episodes)
    .set({ videoUrl: mergedRelative, thumbnail: coverPoster || posterRel, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))

  logTaskSuccess('MergeTask', 'episode-merge', { mergeId, episodeId, output: mergedRelative, duration, clips: videos.length, subtitles: !!srtPath })
}

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(0); return }
      resolve(Math.round(metadata.format.duration || 0))
    })
  })
}

/**
 * Menjadikan sampul proyek (dramas.thumbnail) sebagai poster hasil akhir episode.
 * Menimpa poster frame hasil ekstraksi ffmpeg sehingga halaman ekspor menampilkan cover proyek.
 * Mengembalikan path relatif poster yang dipakai, atau null jika gagal/tidak ada thumbnail.
 */
async function applyDramaCoverAsPoster(dramaId: number, mergedRelative: string): Promise<string | null> {
  try {
    const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
    const cover = drama?.thumbnail
    if (!cover) return null
    const posterRel = posterPathFor(mergedRelative)
    await sharp(getAbsolutePath(cover))
      .rotate()
      .resize({ width: 640, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(getAbsolutePath(posterRel))
    logTaskSuccess('MergeTask', 'cover-poster', { dramaId, poster: posterRel })
    return posterRel
  } catch (err) {
    console.warn(`[ffmpeg-merge] Gagal memasang sampul proyek sebagai poster hasil akhir:`, (err as Error).message)
    return null
  }
}
