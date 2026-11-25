import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('episodes route exposes soft delete', () => {
  const route = read('src/routes/episodes.ts')

  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /set\(\{ deletedAt: now\(\)/)
  assert.match(route, /Episode tidak ditemukan/)
  // \u65e0\u786c\u5220
  assert.doesNotMatch(route, /db\.delete\(schema\.episodes\)/)
})

test('drama queries exclude soft-deleted episodes', () => {
  const dramas = read('src/routes/dramas.ts')

  // \u5217\u8868\u805a\u5408\u4e0e\u8be6\u60c5\u90fd\u8fc7\u6ee4 deletedAt
  const matches = dramas.match(/isNull\(schema\.episodes\.deletedAt\)/g) || []
  assert.ok(matches.length >= 2, `expected >=2 deletedAt filters, got ${matches.length}`)
  // \u65b0\u5efa\u96c6\u65f6\u4e0b\u4e00\u96c6\u53f7\u4e5f\u5ffd\u7565\u8f6f\u5220\u96c6
  const episodes = read('src/routes/episodes.ts')
  assert.match(episodes, /isNull\(schema\.episodes\.deletedAt\)/)
})
