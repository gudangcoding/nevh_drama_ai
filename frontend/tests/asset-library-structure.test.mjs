import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('episode card exposes a delete action', () => {
  const page = read('app/pages/drama/[id]/index.vue')
  const useApi = read('app/composables/useApi.ts')

  assert.match(useApi, /episodeAPI = \{[\s\S]*?del: \(id: number\) => api\.del\(`\/episodes\/\$\{id\}`\)/)
  assert.match(page, /class="btn btn-icon btn-sm ep-delete"/)
  assert.match(page, /@click\.stop="episodeToDelete = ep"/)
  assert.match(page, /<ConfirmDialog/)
  assert.match(page, /Delete "/)
  assert.match(page, /await episodeAPI\.del\(ep\.id\)/)
  // do not use the browser's native confirm dialog
  assert.doesNotMatch(page, /[^D]confirm\(/)
})

test('drama detail header links to the asset library page', () => {
  const page = read('app/pages/drama/[id]/index.vue')

  assert.match(page, /Asset library/)
  assert.match(page, /navigateTo\(`\/drama\/\$\{drama\.id\}\/assets`\)/)
})

test('episode status is manually marked, not derived from script content', () => {
  const page = read('app/pages/drama/[id]/index.vue')

  // Manual status: options + dropdown + persisted to episodes.status
  assert.match(page, /const epStatusOptions = \[/)
  assert.match(page, /function epStatus\(ep\) \{ return ep\.status \|\| 'draft' \}/)
  assert.match(page, /function setEpisodeStatus/)
  assert.match(page, /episodeAPI\.update\(ep\.id, \{ status \}\)/)
  assert.match(page, /epStatusMenuId/)
  // auto-derived status removed
  assert.doesNotMatch(page, /hasScript/)
  assert.doesNotMatch(page, /Script completed/)
  assert.doesNotMatch(page, /Not written/)
})

test('asset library page lists character and scene images', () => {
  const page = read('app/pages/drama/[id]/assets.vue')

  // Data source: all image generation records for the project + project detail (name resolution)
  assert.match(page, /taskAPI\.list\(\{ type: 'image', drama_id: dramaId \}\)/)
  assert.match(page, /dramaAPI\.get\(dramaId\)/)
  // only completed character/scene images
  assert.match(page, /r\.status === 'completed' && \(r\.characterId \|\| r\.sceneId\)/)
  // All / Characters / Scenes filter
  assert.match(page, /\{ label: 'All', value: 'all' \}/)
  assert.match(page, /\{ label: 'Character', value: 'character' \}/)
  assert.match(page, /\{ label: 'Scene', value: 'scene' \}/)
  assert.match(page, /characterAssets/)
  assert.match(page, /sceneAssets/)
  // grid + preview
  assert.match(page, /class="card asset-card"/)
  assert.match(page, /openViewer\(asset\)/)
  assert.match(page, /viewer-overlay/)
  // empty-state guidance
  assert.match(page, /No /)
  assert.match(page, /will be collected here automatically/)
})
