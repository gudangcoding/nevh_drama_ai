import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('POST /episodes auto-locks configs when not provided', () => {
  const route = read('src/routes/episodes.ts')
  const ai = read('src/services/ai.ts')

  // \u4e0d\u518d\u5f3a\u5236\u8981\u6c42 config id
  assert.doesNotMatch(route, /image_config_id and video_config_id are required/)
  // \u901a\u8fc7 getActiveConfigId \u81ea\u52a8\u9501\u5b9a
  assert.match(route, /getActiveConfigId\('image'\)/)
  assert.match(route, /getActiveConfigId\('video'\)/)
  // ai.ts \u63d0\u4f9b getActiveConfigId
  assert.match(ai, /export async function getActiveConfigId/)
  // \u627e\u4e0d\u5230\u542f\u7528\u914d\u7f6e\u65f6\u7ed9\u53ef\u64cd\u4f5c\u7684\u9519\u8bef\u63d0\u793a
  assert.match(route, /Tidak ditemukan konfigurasi pembuatan gambar/)
  assert.match(route, /Tidak ditemukan konfigurasi pembuatan video/)
})

test('POST /episodes still honors explicit config ids when caller passes them', () => {
  const route = read('src/routes/episodes.ts')

  assert.match(route, /body\.image_config_id \?\? await getActiveConfigId/)
  assert.match(route, /body\.video_config_id \?\? await getActiveConfigId/)
})