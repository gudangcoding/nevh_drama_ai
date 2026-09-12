/**
 * Statistik penggunaan direktori data + ruang kosong disk
 *
 * - dirUsage: sekali jalan rekursif asinkron (fs.promises, tidak memblokir event loop), dielompokkan berdasarkan path relatif
 * - File database (huobao.sqlite3/-wal/-shm) tidak dihitung berulang di jalan, di-stat secara terpisah
 *   (saat mode server STORAGE_PATH ditimpa, SQLITE_PATH mungkin berada di luar root data)
 */
import type { Dirent } from 'fs'
import fsp from 'fs/promises'
import path from 'path'

export interface UsageBuckets {
  db: number
  images: number
  videos: number
  merged: number
  uploads: number
  temp: number
  other: number
  total: number
}

const DB_FILE_BASE = 'huobao.sqlite3'

/** Jalan rekursif, callback untuk setiap file biasa (path lengkap + ukuran); direktori tidak dapat dibaca/saingan file diam-diam dilewati */
async function walkFiles(dir: string, onFile: (filePath: string, size: number) => void): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkFiles(full, onFile)
    } else if (entry.isFile()) {
      try {
        const st = await fsp.stat(full)
        onFile(full, st.size)
      } catch { /* File menghilang saat jalan atau saingan lain, abaikan */ }
    }
  }
}

/** Menghitung penggunaan direktori data (dielompokkan berdasarkan tujuan); ember db = SQLITE_PATH database utama + -wal/-shm tiga file */
export async function dirUsage(dataRoot: string, sqlitePath: string): Promise<UsageBuckets> {
  const usage: UsageBuckets = { db: 0, images: 0, videos: 0, merged: 0, uploads: 0, temp: 0, other: 0, total: 0 }
  const add = (bucket: keyof UsageBuckets, size: number) => {
    usage[bucket] += size
    usage.total += size
  }

  // Ember db: stat langsung tiga file (apakah di dalam dataRoot atau tidak, sisi jalan akan melewati untuk menghitung ganda)
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      const st = await fsp.stat(sqlitePath + suffix)
      if (st.isFile()) add('db', st.size)
    } catch { /* File tidak ada (misalnya -wal hilang jika WAL belum diaktifkan) */ }
  }

  await walkFiles(dataRoot, (filePath, size) => {
    const rel = path.relative(dataRoot, filePath)
    if (rel === DB_FILE_BASE || rel.startsWith(DB_FILE_BASE + '-')) return // Sudah dihitung terpisah di ember db
    const parts = rel.split(path.sep)
    if (parts[0] === 'static' && parts.length >= 2) {
      const sub = parts[1]
      if (sub === 'images' || sub === 'videos' || sub === 'merged' || sub === 'uploads' || sub === 'temp') {
        add(sub, size)
        return
      }
    }
    add('other', size)
  })
  return usage
}

/** Sisa byte pada volume tempat direktori berada; mengembalikan null jika statfs tidak tersedia (pemanggil melewati verifikasi ruang) */
export async function volumeFreeBytes(dir: string): Promise<number | null> {
  try {
    const st = await fsp.statfs(dir)
    return st.bavail * st.bsize
  } catch {
    return null
  }
}
