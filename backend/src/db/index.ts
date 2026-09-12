import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import { initSqliteSchema } from './sqlite-schema.js'
import { maybeAutoImportMysql } from './mysql-import.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// src/db → tiga tingkat di atas adalah akar repo (sesuai tingkat inferensi di utils/paths.ts)
const repoRoot = path.resolve(__dirname, '../../..')

// Versi desktop menyuntikkan SQLITE_PATH dari proses utama Electron (di bawah userData); dev menggunakan akar repo data/ secara default
// Perhatian: jangan gunakan nama file lama huobao_drama.db — itu adalah database lama dari era SQLite awal, nama tabel tumpang tindih tapi kolom berbeda
export const dbPath = process.env.SQLITE_PATH || path.join(repoRoot, 'data', 'huobao.sqlite3')
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const sqlite = new Database(dbPath)

// WAL: polling tugas generasi dan pembacaan halaman bersamaan tidak saling memblokir; busy_timeout sebagai cadangan kompetisi kunci tulis
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 5000')
sqlite.pragma('synchronous = NORMAL')

/** Memulai pembuatan tabel (DDL idempotent replay + seed mengisi kekurangan). SQLite tidak ada masalah koneksi siap, tidak perlu retry */
export function initDb() {
  initSqliteSchema(sqlite)
}

initDb()

// Migrasi otomatis satu kali untuk pengguna MySQL lama: hanya dipicu saat MySQL dikonfigurasi eksplisit + database kosong + tanpa penanda (lihat komentar header di mysql-import.ts)
await maybeAutoImportMysql(sqlite, dbPath)

/** lastInsertRowid dari better-sqlite3 mungkin bigint, dikonversi seragam ke number */
export function getInsertId(result: unknown) {
  const res = result as { lastInsertRowid?: number | bigint } | undefined
  if (res?.lastInsertRowid === undefined || res.lastInsertRowid === null) {
    throw new Error('SQLite insert did not return lastInsertRowid')
  }
  return Number(res.lastInsertRowid)
}

export const db = drizzle(sqlite, { schema })
export { schema }
export type DB = typeof db
