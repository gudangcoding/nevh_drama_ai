import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('characters route supports manual create and soft delete', () => {
  const route = read('src/routes/characters.ts')

  assert.match(route, /app\.post\('\/'/)
  assert.match(route, /name required/)
  // \u4f20\u5165 episode_id \u65f6\u5173\u8054\u5230\u8be5\u96c6
  assert.match(route, /insert\(schema\.episodeCharacters\)/)
  // \u8f6f\u5220\u9664
  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /deletedAt: now\(\)/)
  assert.doesNotMatch(route, /db\.delete\(schema\.characters\)/)
})

test('scenes route links new scenes to episode and soft deletes', () => {
  const route = read('src/routes/scenes.ts')

  assert.match(route, /app\.post\('\/'/)
  assert.match(route, /location required/)
  assert.match(route, /insert\(schema\.episodeScenes\)/)
  // \u8f6f\u5220\u9664（\u539f\u4e3a\u786c\u5220，\u4fdd\u7559\u5386\u53f2\u751f\u6210\u8bb0\u5f55）
  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /deletedAt: now\(\)/)
  assert.doesNotMatch(route, /db\.delete\(schema\.scenes\)/)
})

test('props route supports manual create and soft delete', () => {
  const route = read('src/routes/props.ts')

  assert.match(route, /app\.post\('\/'/)
  assert.match(route, /name required/)
  assert.match(route, /insert\(schema\.episodeProps\)/)
  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /deletedAt: now\(\)/)
  assert.doesNotMatch(route, /db\.delete\(schema\.props\)/)
})
