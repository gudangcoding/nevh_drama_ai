/**
 * Impor data MySQL → SQLite (migrasi otomatis saat startup + inti bersama skrip CLI)
 *
 * Kondisi pemicu migrasi otomatis (semua harus terpenuhi):
 * 1. Tidak mengatur MYSQL_AUTO_IMPORT=false
 * 2. MySQL dikonfigurasi secara eksplisit (DATABASE_URL atau MYSQL_HOST; nilai default murni tidak memicu, menghindari pengguna desktop/pemasangan baru terhubung salah)
 * 3. Tabel bisnis SQLite kosong (seed style_presets tidak dihitung)
 * 4. Tidak ada file penanda penyelesaian <sqlite>.mysql-imported (ditulis setelah impor berhasil; tidak ditulis jika MySQL tidak dapat dijangkau, percobaan ulang saat startup berikutnya)
 *
 * Impor dua tahap: pertama membaca penuh dari MySQL ke memori, lalu menulis dalam satu transaksi SQLite,
 * kegagalan pada langkah apa pun membatalkan seluruhnya, tidak meninggalkan status migrasi setengah jadi.
 */
import fs from 'fs'
import mysql from 'mysql2/promise'
import type { Database as SqliteDB } from 'better-sqlite3'

/** Urutan dependensi: tabel yang dirujuk ditulis lebih dulu (hanya konvensi keterbacaan saat SQLite tidak mengaktifkan foreign key, menjaga urutan impor tetap jelas) */
export const MIGRATE_TABLES = [
  'dramas',
  'characters',
  'props',
  'scenes',
  'episodes',
  'storyboards',
  'episode_characters',
  'episode_scenes',
  'episode_props',
  'storyboard_characters',
  'storyboard_props',
  'ai_service_configs',
  'ai_service_providers',
  'style_presets',
  'sys_task',
  'video_merges',
  'assets',
]

/** Baris MySQL → nilai yang dapat diikat SQLite (boolean→0/1, undefined→null) */
export function sanitize(v: unknown): string | number | bigint | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v
  return String(v)
}

/**
 * Hanya mengembalikan string koneksi saat MySQL dikonfigurasi secara eksplisit (DATABASE_URL atau MYSQL_HOST).
 * Nilai default murni tidak memicu, menghindari pengguna desktop/pemasangan baru terhubung ke MySQL lokal yang tidak relevan.
 */
export function mysqlUrlFromEnv(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  if (!process.env.MYSQL_HOST) return null
  const host = process.env.MYSQL_HOST
  const port = process.env.MYSQL_PORT || '3306'
  const user = encodeURIComponent(process.env.MYSQL_USER || 'huobao')
  const password = encodeURIComponent(process.env.MYSQL_PASSWORD || 'huobao')
  const database = process.env.MYSQL_DATABASE || 'huobao_drama'
  return `mysql://${user}:${password}@${host}:${port}/${database}`
}

/** Apakah tabel bisnis SQLite kosong (seed startup style_presets tidak dihitung) */
export function sqliteBusinessRowCount(sqlite: SqliteDB): number {
  return MIGRATE_TABLES
    .filter(t => t !== 'style_presets')
    .reduce((sum, t) => {
      const { n } = sqlite.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }
      return sum + n
    }, 0)
}

/**
 * Impor dua tahap: pertama membaca penuh, lalu menulis dalam satu transaksi; ketidaksesuaian jumlah baris melempar error (transaksi dibatalkan).
 */
export async function importMysqlData(
  pool: mysql.Pool,
  sqlite: SqliteDB,
  log: (msg: string) => void = console.log,
): Promise<{ totalSrc: number; totalDst: number }> {
  // Tahap pertama: membaca
  const dump: Record<string, Record<string, unknown>[]> = {}
  for (const table of MIGRATE_TABLES) {
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``)
    dump[table] = rows as Record<string, unknown>[]
  }

  // Tahap kedua: menulis dalam satu transaksi
  let totalSrc = 0
  let totalDst = 0
  const mismatch: string[] = []

  sqlite.transaction(() => {
    for (const table of MIGRATE_TABLES) {
      const data = dump[table]
      const columns = data.length ? Object.keys(data[0]) : null

      // Mengosongkan tabel target sebelum impor: seed inisialisasi style_presets akan bertabrakan dengan UNIQUE(value); eksekusi berulang menjaga idempotensi
      if (data.length) {
        sqlite.prepare(`DELETE FROM "${table}"`).run()
      }

      if (columns) {
        const colList = columns.map(c => `"${c}"`).join(', ')
        const placeholders = columns.map(() => '?').join(', ')
        const stmt = sqlite.prepare(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`)
        for (const row of data) {
          stmt.run(...columns.map(c => sanitize(row[c])))
        }
      }

      const dst = (sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n
      totalSrc += data.length
      totalDst += dst
      log(`${data.length === dst ? '✓' : '✗'} ${table}: mysql=${data.length} sqlite=${dst}`)
      if (data.length !== dst) mismatch.push(table)
    }
  })()

  if (mismatch.length) {
    throw new Error(`行数不一致: ${mismatch.join(', ')}`)
  }
  return { totalSrc, totalDst }
}

/**
 * Migrasi otomatis saat startup (kondisi lihat komentar header file). Tidak pernah melempar: kegagalan hanya memperingatkan dan membatalkan, tidak memblokir startup layanan.
 */
export async function maybeAutoImportMysql(sqlite: SqliteDB, dbPath: string): Promise<void> {
  const tag = '[mysql-import]'
  if ((process.env.MYSQL_AUTO_IMPORT || 'true').toLowerCase() === 'false') return

  const url = mysqlUrlFromEnv()
  if (!url) return

  const marker = `${dbPath}.mysql-imported`
  if (fs.existsSync(marker)) return

  if (sqliteBusinessRowCount(sqlite) > 0) return // Sudah ada data bisnis, lewati secara diam-diam

  let pool: mysql.Pool | null = null
  try {
    pool = mysql.createPool({ uri: url, connectionLimit: 4, charset: 'utf8mb4', connectTimeout: 3000 })
    await pool.query('SELECT 1')
  } catch (err) {
    console.warn(`${tag} 已配置 MySQL 但连接失败（${(err as Error).message}），本次跳过自动迁移，下次启动重试`)
    await pool?.end().catch(() => {})
    return
  }

  try {
    // Sisi MySQL tidak ada data bisnis → tulis penanda, menghindari deteksi setiap startup
    const [rows] = await pool.query('SELECT (SELECT COUNT(*) FROM `dramas`) + (SELECT COUNT(*) FROM `ai_service_configs`) AS n')
    const mysqlRows = Number((rows as { n: number }[])[0]?.n || 0)
    if (mysqlRows === 0) {
      fs.writeFileSync(marker, `mysql source empty at ${new Date().toISOString()}\n`)
      return
    }

    console.log(`${tag} 检测到 MySQL 旧数据（${mysqlRows} 行关键表记录），开始自动迁移到 SQLite…`)
    if (fs.existsSync(dbPath)) {
      const backup = `${dbPath}.bak-${Date.now()}`
      fs.copyFileSync(dbPath, backup)
      console.log(`${tag} 已备份现有库 → ${backup}`)
    }

    const { totalSrc, totalDst } = await importMysqlData(pool, sqlite, msg => console.log(`${tag} ${msg}`))
    fs.writeFileSync(marker, `imported ${totalSrc} rows at ${new Date().toISOString()}\n`)
    console.log(`${tag} 迁移完成 ✓（mysql=${totalSrc} sqlite=${totalDst}）`)
    console.log(`${tag} 提示：若旧部署的 data/static 媒体文件不在本机，请手动拷贝，否则历史素材将无法访问`)
  } catch (err) {
    console.error(`${tag} 自动迁移失败（已回滚，不影响本次启动，下次启动将重试）:`, (err as Error).message)
  } finally {
    await pool.end().catch(() => {})
  }
}
