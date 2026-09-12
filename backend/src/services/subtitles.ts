/**
 * Ekstraksi dialog dari deskripsi storyboard & pembangkit file SRT
 *
 * Deskripsi storyboard memiliki struktur:
 *   【Shot1】deskripsi visual; NamaKarakter berkata: "dialog"; Narasi: narasi
 *   【Shot2】...
 *
 * Timing per dialogue dialokasikan proporsional terhadap durasi segmen storyboard,
 * dengan durasi minimum 0.8 detik per baris dan jeda 0.3 detik antar baris.
 */
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { ffmpeg } from '../utils/ffmpeg.js'
import { STORAGE_ROOT } from '../utils/paths.js'
import type { ContentLanguage } from './app-settings.js'

// ── Pola dialog per bahasa ──────────────────────────────────────────────────

interface DialoguePattern {
  /** Regex menangkap group[1] = nama pembicara, group[2] = isi dialog/narasi */
  dialog: RegExp
  narration: RegExp
}

const PATTERNS: Record<ContentLanguage, DialoguePattern> = {
  id: {
    dialog: /([^：【】\n:]+?)\s*berkata\s*:\s*["「]([^"」]+)["」"]/g,
    narration: /Narasi\s*:\s*(.+?)$/g,
  },
  en: {
    dialog: /([^：【】\n:]+?)\s+says\s*:\s*[""]([^""]+)[""]/g,
    narration: /Narration\s*:\s*(.+?)$/g,
  },
  zh: {
    dialog: /([^：【】\n:：]+?)[说]\s*[:：]\s*[「"]([^「"]+)[」"]/g,
    narration: /旁白\s*[:：]\s*(.+?)$/g,
  },
  ja: {
    dialog: /([^：【】\n:：]+?)は言う[：:]\s*[「"]([^「"]+)[」"]/g,
    narration: /ナレーション[：:]\s*(.+?)$/g,
  },
  ko: {
    dialog: /([^：【】\n:：]+?)이\s*[: ]*말한다\s*[: ]*\s*[「"]([^「"]+)[」"]/g,
    narration: /내레이션\s*[: ]*\s*(.+?)$/g,
  },
}

// Fallback: tangkap garis yang mengandung kata kunci dialog universal
const FALLBACK_DIALOG = /([^\n:：【】]+?)\s*(?:says|said|berkata|说|は言う|말한다)\s*[:：]\s*["「「]([^"」」]+)["」」"]/g
const FALLBACK_NARRATION = /(?:Narasi|Narration|旁白|ナレーション|내레이션)\s*[:：]\s*(.+?)$/g

// ── Parsing dialog dari deskripsi ──────────────────────────────────────────

export interface DialogLine {
  speaker: string
  text: string
}

/**
 * Parse satu blok sub-shot (teks setelah 【ShotN】) → daftar baris dialog/narasi
 */
function parseShotBlock(text: string, patterns: DialoguePattern): DialogLine[] {
  const lines: DialogLine[] = []
  let m: RegExpExecArray | null

  // Dialog utama
  patterns.dialog.lastIndex = 0
  while ((m = patterns.dialog.exec(text)) !== null) {
    const speaker = m[1].trim()
    const dialogText = m[2].trim()
    if (speaker && dialogText) lines.push({ speaker, text: dialogText })
  }
  if (!lines.length) {
    FALLBACK_DIALOG.lastIndex = 0
    while ((m = FALLBACK_DIALOG.exec(text)) !== null) {
      const speaker = m[1].trim()
      const dialogText = m[2].trim()
      if (speaker && dialogText) lines.push({ speaker, text: dialogText })
    }
  }

  // Narasi
  patterns.narration.lastIndex = 0
  while ((m = patterns.narration.exec(text)) !== null) {
    const narrationText = m[1].trim()
    if (narrationText) lines.push({ speaker: 'Narasi', text: narrationText })
  }
  if (!lines.find(l => l.speaker === 'Narasi')) {
    FALLBACK_NARRATION.lastIndex = 0
    while ((m = FALLBACK_NARRATION.exec(text)) !== null) {
      const narrationText = m[1].trim()
      if (narrationText) lines.push({ speaker: 'Narasi', text: narrationText })
    }
  }

  return lines
}

/**
 * Ekstrak dialog dari deskripsi storyboard utuh
 */
export function extractDialogues(lang: ContentLanguage, description: string | null): DialogLine[] {
  if (!description) return []
  const patterns = PATTERNS[lang] || PATTERNS.en

  const allLines: DialogLine[] = []
  const shotBlocks = description.split(/【Shot\d+】/i)
  for (const block of shotBlocks) {
    if (!block.trim()) continue
    allLines.push(...parseShotBlock(block, patterns))
  }
  return allLines
}

// ── SRT generation ─────────────────────────────────────────────────────────

function srtTimestamp(seconds: number): string {
  if (seconds < 0) seconds = 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

interface StoryboardClip {
  storyboardId: number
  storyboardNumber: number
  description: string | null
  duration: number    // detik, dari ffprobe
  videoPath: string
}

const CHARS_PER_SEC = 10
const MIN_LINE_DURATION = 0.8
const LINE_GAP = 0.3

/**
 * Bangun konten SRT dari daftar klip storyboard dengan timing kumulatif.
 * Menghitung offset berdasarkan durasi ffprobe aktual dari tiap klip.
 * Dialog dalam tiap klip dialokasikan proporsional terhadap panjang karakter.
 */
export function buildMergeSrt(clips: StoryboardClip[], lang: ContentLanguage): string {
  const entries: { index: number; start: number; end: number; text: string }[] = []
  let cursor = 0
  let cueIndex = 1

  for (const clip of clips) {
    const dialogues = extractDialogues(lang, clip.description)
    if (dialogues.length && clip.duration > 0) {
      const totalChars = dialogues.reduce((sum, d) => sum + d.text.length, 0) || 1
      const available = Math.max(0, clip.duration - (dialogues.length - 1) * LINE_GAP)

      let localCursor = cursor
      for (const d of dialogues) {
        const ratio = d.text.length / totalChars
        const lineDur = Math.max(MIN_LINE_DURATION, Math.min(available * ratio, clip.duration / dialogues.length))
        const end = Math.min(localCursor + lineDur, cursor + clip.duration)
        entries.push({ index: cueIndex++, start: localCursor, end, text: d.text })
        localCursor = end + LINE_GAP
      }
    }

    // Advance cursor ke awal segmen berikutnya
    cursor += clip.duration
  }

  if (!entries.length) return ''

  // Format SRT
  return entries.map((e, i) =>
    `${i + 1}\n${srtTimestamp(e.start)} --> ${srtTimestamp(e.end)}\n${e.text}`
  ).join('\n\n') + '\n'
}

// ── Durasi klip via ffprobe ────────────────────────────────────────────────

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(0); return }
      resolve(metadata.format.duration || 0)
    })
  })
}

// ── Pipeline: build SRT untuk merge ────────────────────────────────────────

export interface BuildSubtitleOptions {
  episodeId: number
  lang: ContentLanguage
  clipFiles: string[]            // path relatif ke video (urutan concat)
  storageRoot?: string
}

/**
 * Bangun file SRT untuk episode yang akan digabung.
 * Mengembalikan path absolut file SRT (dihapus oleh pemanggil setelah dipakai), atau null jika tidak ada dialog.
 */
export async function buildEpisodeSrt(opts: BuildSubtitleOptions): Promise<string | null> {
  const { episodeId, lang, clipFiles } = opts
  const storageRoot = opts.storageRoot || STORAGE_ROOT

  // Ambil data storyboard episode ini
  const allSbs = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)

  // Susun klip dengan mapping ke storyboard dan probe durasi aktual
  const clips: StoryboardClip[] = []
  for (const videoRel of clipFiles) {
    const normRel = videoRel.replace(/\\/g, '/')
    const sb = allSbs.find(s => {
      const vu = (s.videoUrl || s.composedVideoUrl || '').replace(/\\/g, '/')
      return vu === normRel
    })

    const absPath = path.isAbsolute(videoRel)
      ? videoRel
      : path.join(storageRoot, videoRel)

    const duration = await probeDuration(absPath)
    if (duration <= 0) continue

    clips.push({
      storyboardId: sb?.id || 0,
      storyboardNumber: sb?.storyboardNumber || clips.length + 1,
      description: sb?.description || null,
      duration,
      videoPath: videoRel,
    })
  }

  if (!clips.length) return null

  const srtContent = buildMergeSrt(clips, lang)
  if (!srtContent || !srtContent.trim()) return null

  // Tulis file SRT sementara
  const srtDir = path.join(storageRoot, 'temp')
  fs.mkdirSync(srtDir, { recursive: true })
  const srtPath = path.join(srtDir, `${uuid()}.srt`)
  fs.writeFileSync(srtPath, srtContent, 'utf-8')
  return srtPath
}
