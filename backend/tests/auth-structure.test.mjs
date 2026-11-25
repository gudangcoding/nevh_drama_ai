import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('multi-user auth: schema has users/sessions + dramas.user_id', () => {
  const schema = read('src/db/schema.ts')
  assert.match(schema, /export const users = sqliteTable\('users'/)
  assert.match(schema, /username: text\('username'\)\.notNull\(\)\.unique\(\)/)
  assert.match(schema, /role: text\('role'\)\.notNull\(\)\.default\('user'\)/)
  assert.match(schema, /export const sessions = sqliteTable\('sessions'/)
  assert.match(schema, /export const dramas = sqliteTable\('dramas'/)
  assert.match(schema, /userId: integer\('user_id'\)/)

  const ddl = read('src/db/sqlite-schema.ts')
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS users/)
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS sessions/)
  assert.match(ddl, /ALTER TABLE dramas ADD COLUMN user_id INTEGER/)
})

test('auth service hashes passwords with scrypt and issues sessions', () => {
  const svc = read('src/services/auth.ts')
  assert.match(svc, /hashPassword/)
  assert.match(svc, /verifyPassword/)
  assert.match(svc, /timingSafeEqual/)
  assert.match(svc, /generateToken\(\):\s*string/)
  assert.match(svc, /createSession/)
  assert.match(svc, /getUserByToken/)
  assert.match(svc, /seedDefaultAdmin/)
  assert.match(svc, /'admin'/)
})

test('requireAuth middleware reads Bearer token and throws 401', () => {
  const mw = read('src/middleware/auth.ts')
  assert.match(mw, /Authorization/)
  assert.match(mw, /Bearer /)
  assert.match(mw, /status:\s*401/)
})

test('ownership service enforces admin default + per-user drama access', () => {
  const ow = read('src/services/ownership.ts')
  assert.match(ow, /getUser\(c: Context\)/)
  assert.match(ow, /role === 'admin'/)
  assert.match(ow, /assertDramaAccess/)
  assert.match(ow, /assertEpisodeAccess/)
  assert.match(ow, /assertCharacterAccess/)
  assert.match(ow, /assertSceneAccess/)
  assert.match(ow, /assertPropAccess/)
  assert.match(ow, /assertStoryboardAccess/)
  assert.match(ow, /assertTaskAccess/)
  assert.match(ow, /filterTasksByOwnership/)
  assert.match(ow, /drama\.userId !== user\.id/)
})

test('auth routes expose register/login/logout/me + profile/password update', () => {
  const route = read('src/routes/auth.ts')
  assert.match(route, /app\.post\('\/register'/)
  assert.match(route, /app\.post\('\/login'/)
  assert.match(route, /app\.post\('\/logout'/)
  assert.match(route, /app\.get\('\/me'/)
  assert.match(route, /app\.put\('\/me'/)
  assert.match(route, /app\.put\('\/password'/)
  assert.match(route, /requireAuth/)
})

test('device session allows login-free desktop use without weakening server auth', () => {
  const route = read('src/routes/auth.ts')
  // Endpoint sesi perangkat khusus desktop (akun tertua agar data lama tetap terbuka)
  assert.match(route, /app\.post\('\/device'/)
  assert.match(route, /HUOBAO_DESKTOP/)
  assert.match(route, /orderBy\(asc\(schema\.users\.id\)\)/)
  assert.match(route, /createSession\(user\.id\)/)
})

test('index.ts mounts public auth + requires auth for the rest of the API', () => {
  const idx = read('src/index.ts')
  assert.match(idx, /api\.route\('\/auth', auth\)/)
  assert.match(idx, /protectedApi\.use\('\*', requireAuth\)/)
  assert.match(idx, /protectedApi\.route\('\/dramas'/)
  assert.match(idx, /seedDefaultAdmin\(\)/)
})

test('ownership guards are applied in dramas/common routes', () => {
  const dramas = read('src/routes/dramas.ts')
  assert.match(dramas, /assertDramaAccess\(c, id\)/)
  assert.match(dramas, /getUser\(c\)\.id/)
  assert.match(dramas, /isAdmin\(user\)/)

  const episodes = read('src/routes/episodes.ts')
  assert.match(episodes, /assertEpisodeAccess\(c/)
  assert.match(episodes, /assertDramaAccess\(c, Number\(body\.drama_id\)\)/)

  const tasks = read('src/routes/tasks.ts')
  assert.match(tasks, /assertStoryboardAccess\(c, Number\(body\.storyboard_id\)\)/)
  assert.match(tasks, /filterTasksByOwnership\(c, rows\)/)

  const merge = read('src/routes/merge.ts')
  assert.match(merge, /assertEpisodeAccess\(c, episodeId\)/)
})