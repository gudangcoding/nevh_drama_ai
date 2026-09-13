import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('production orchestrator exists with approval-gated phases and idempotent resumes', () => {
  const svc = read('src/services/production.ts')

  // Tahapan & status sesuai desain (script create flow kanan: scripts→assets→asset_images→storyboards→composed_images→waiting_approval→videos→merging)
  assert.match(svc, /export type ProductionPhase =/)
  for (const ph of ['scripts', 'assets', 'asset_images', 'storyboards', 'composed_images', 'waiting_approval', 'videos', 'merging']) {
    assert.match(svc, new RegExp(`case '${ph}':`))
  }
  assert.match(svc, /'running' \| 'waiting_approval' \| 'completed' \| 'failed' \| 'cancelled' \| 'interrupted'/)

  // Gerbang persetujuan manual sebelum fase video
  assert.match(svc, /status: 'waiting_approval'/)
  assert.match(svc, /approvedAt/)
  assert.match(svc, /Setujui alur cerita & adegan|Menunggu persetujuan alur cerita & adegan/)

  // Idempotensi: fase menghitung pekerjaan yang tersisa dari database (bekerja tanpa menghitung ulang pekerjaan yang selesai)
  assert.match(svc, /filter\(c => !c\.imageUrl\)/)
  assert.match(svc, /!sb\.composedImage/)
  assert.match(svc, /!hasVideo/)
  assert.match(svc, /status: 'failed', errorMsg/)

  // Konkurensi terbatas (2 paralel) untuk tugas generasi
  assert.match(svc, /mapLimit\(items, 2,/)
  assert.match(svc, /mapLimit\(tasks, 2,/)

  // Koneksi ulang service yang sudah ada
  assert.match(svc, /startExtraction/)
  assert.match(svc, /startVideoPromptBatch/)
  assert.match(svc, /mergeEpisodeVideos/)
  assert.match(svc, /runAgentSilent\('episode_expander'/)

  // API publik
  assert.match(svc, /export async function startProduction/)
  assert.match(svc, /export async function approveProduction/)
  assert.match(svc, /export async function cancelProduction/)
  assert.match(svc, /export async function resumeProduction/)
  assert.match(svc, /export async function getProductionStatus/)
  assert.match(svc, /export async function markInterruptedJobs/)
})

test('dramas route exposes production endpoints and accepts synopsis/total_episodes/auto_generate', () => {
  const route = read('src/routes/dramas.ts')

  assert.match(route, /synopsis: body\.synopsis/)
  assert.match(route, /totalEpisodes: body\.total_episodes \|\| 1/)
  assert.match(route, /startProduction\(dramaId, \{ auto_video: !!body\.auto_video \}\)/)
  assert.match(route, /auto_video: !!body\.auto_video/)
  assert.match(route, /auto_generate \|\| body\.autoGenerate/)

  assert.match(route, /app\.get\('\/:id\/production'/)
  assert.match(route, /app\.post\('\/:id\/production\/start'/)
  assert.match(route, /app\.post\('\/:id\/production\/approve'/)
  assert.match(route, /app\.post\('\/:id\/production\/cancel'/)
  assert.match(route, /app\.post\('\/:id\/production\/resume'/)
})

test('sqlite schema persists production_jobs and auto-migrates dramas.synopsis', () => {
  const sql = read('src/db/sqlite-schema.ts')
  const drizzle = read('src/db/schema.ts')

  assert.match(sql, /CREATE TABLE IF NOT EXISTS production_jobs/)
  assert.match(sql, /phase TEXT NOT NULL DEFAULT 'scripts'/)
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'running'/)
  assert.match(sql, /PRAGMA table_info\(dramas\)/)
  assert.match(sql, /ALTER TABLE dramas ADD COLUMN synopsis TEXT/)

  assert.match(drizzle, /synopsis: text\('synopsis'\)/)
  assert.match(drizzle, /productionJobs = sqliteTable\('production_jobs'/)
  assert.match(drizzle, /approvedAt: text\('approved_at'\)/)
})

test('episode_expander agent is registered with tools and prompts', () => {
  const agents = read('src/agents/index.ts')
  const tools = read('src/agents/tools/episode-tools.ts')

  assert.match(agents, /episode_expander:/)
  assert.match(agents, /storyboard_breaker: storyboardTools/)

  // Tool konteks sinopsis + simpan konten episode
  assert.match(tools, /id: 'read_synopsis_context'/)
  assert.match(tools, /id: 'save_episode_content'/)
  assert.match(tools, /previous_episodes/)
  assert.match(tools, /drama\.synopsis \|\| drama\.description/)
})

test('app restart marks running production jobs as interrupted, keeps waiting_approval', () => {
  const svc = read('src/services/production.ts')
  const index = read('src/index.ts')

  assert.match(svc, /status: 'interrupted'/)
  assert.match(svc, /if \(job\.status === 'running'\)/)
  assert.match(index, /markInterruptedJobs\(\)/)
})