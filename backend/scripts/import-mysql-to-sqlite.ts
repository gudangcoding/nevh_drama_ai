/**
 * MySQL → SQLite \u4e00\u6b21\u6027\u6570\u636e\u8fc1\u79fb\u811a\u672c（CLI）
 *
 * \u7528\u6cd5：cd backend && npx tsx scripts/import-mysql-to-sqlite.ts [--force]
 *
 * - \u6e90：MySQL（\u8bfb\u53d6 DATABASE_URL \u6216 MYSQL_* \u73af\u5883\u53d8\u91cf，\u517c\u5bb9 backend/.env）
 * - \u76ee\u6807：SQLITE_PATH \u73af\u5883\u53d8\u91cf，\u9ed8\u8ba4\u4ed3\u5e93\u6839 data/huobao.sqlite3
 * - \u8868\u7ed3\u6784\u7531 initSqliteSchema \u5e42\u7b49\u521b\u5efa；\u6570\u636e\u663e\u5f0f\u5e26 id \u5199\u5165（AUTOINCREMENT \u8868
 *   \u63d2\u5165\u540e sqlite_sequence \u81ea\u52a8\u5bf9\u9f50 max(id)）
 * - \u76ee\u6807\u5e93\u5df2\u6709\u4e1a\u52a1\u6570\u636e\u65f6\u987b --force \u624d\u5141\u8bb8\u5199\u5165；\u5199\u5165\u524d\u81ea\u52a8\u5907\u4efd .bak
 * - \u9010\u8868\u884c\u6570\u5bf9\u7167，\u4e0d\u4e00\u81f4\u5219\u975e\u96f6\u9000\u51fa
 *
 * \u6ce8\u610f：\u670d\u52a1\u542f\u52a8\u65f6\u5df2\u5185\u7f6e\u540c\u903b\u8f91\u7684\u81ea\u52a8\u8fc1\u79fb（src/db/mysql-import.ts，
 * \u663e\u5f0f\u914d\u7f6e MySQL + \u7a7a\u5e93\u65f6\u89e6\u53d1），\u672c\u811a\u672c\u7528\u4e8e\u624b\u52a8/\u5f3a\u5236\u573a\u666f。
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'
import Database from 'better-sqlite3'
import { initSqliteSchema } from '../src/db/sqlite-schema.js'
import { importMysqlData, mysqlUrlFromEnv, sqliteBusinessRowCount } from '../src/db/mysql-import.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const force = process.argv.includes('--force')

const repoRoot = path.resolve(__dirname, '../..')
const sqlitePath = process.env.SQLITE_PATH || path.join(repoRoot, 'data', 'huobao.sqlite3')

async function main() {
  const url = mysqlUrlFromEnv()
  if (!url) {
    console.error('\u672a\u68c0\u6d4b\u5230 MySQL \u914d\u7f6e（DATABASE_URL \u6216 MYSQL_HOST）')
    process.exit(1)
  }
  const mysqlPool = mysql.createPool({ uri: url, connectionLimit: 4, charset: 'utf8mb4' })

  // \u5907\u4efd\u5df2\u6709\u76ee\u6807\u5e93（\u4ec5\u5f53\u6587\u4ef6\u5b58\u5728\u4e14\u975e\u7a7a\u5e93\u65f6\u624d\u9700\u8981 --force，\u5907\u4efd\u65e0\u6761\u4ef6\u505a）
  if (fs.existsSync(sqlitePath)) {
    const backup = `${sqlitePath}.bak-${Date.now()}`
    fs.copyFileSync(sqlitePath, backup)
    console.log(`\u5df2\u5907\u4efd\u73b0\u6709\u5e93 → ${backup}`)
  }
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true })
  const sqlite = new Database(sqlitePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  initSqliteSchema(sqlite)

  // \u975e\u7a7a\u76ee\u6807\u5e93\u987b --force
  const existing = sqliteBusinessRowCount(sqlite)
  if (existing > 0 && !force) {
    console.error(`\u76ee\u6807\u5e93\u5df2\u542b ${existing} \u884c\u4e1a\u52a1\u6570\u636e。\u786e\u8ba4\u8986\u76d6\u8bf7\u52a0 --force（\u5df2\u81ea\u52a8\u5907\u4efd）`)
    process.exit(1)
  }

  const { totalSrc, totalDst } = await importMysqlData(mysqlPool, sqlite)

  // \u81ea\u589e\u5e8f\u5217\u5bf9\u9f50\u68c0\u67e5（\u663e\u5f0f id \u63d2\u5165\u540e sqlite_sequence \u5e94 >= max(id)）
  const seq = sqlite.prepare(`SELECT name, seq FROM sqlite_sequence`).all() as { name: string; seq: number }[]
  console.log(`\nsqlite_sequence \u5df2\u767b\u8bb0 ${seq.length} \u5f20\u81ea\u589e\u8868`)

  await mysqlPool.end()
  sqlite.close()

  console.log(`\n\u5408\u8ba1: mysql=${totalSrc} sqlite=${totalDst}`)
  console.log('\u8fc1\u79fb\u5b8c\u6210 ✓')
}

main().catch(err => {
  console.error('\u8fc1\u79fb\u5931\u8d25:', err)
  process.exit(1)
})
