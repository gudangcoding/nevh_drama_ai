import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const page = readFileSync(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const studioCss = readFileSync(new URL('../app/assets/studio.css', import.meta.url), 'utf8')

test('project list opens project detail before choosing an episode', () => {
  assert.match(page, /Project launcher/)
  assert.match(page, /openDrama/)
  assert.match(page, /getDramaPath/)
  assert.match(page, /Open project/)
  assert.match(page, /navigateTo\(getDramaPath\(d\)\)/)
  assert.doesNotMatch(page, /openWorkbench/)
})

test('project status is manually marked, not derived from content', () => {
    // Manual status: options + dropdown + persisted to dramas.status
  assert.match(page, /const statusOptions = \[/)
  assert.match(page, /Not started.*draft/s)
  assert.match(page, /In progress.*active/s)
  assert.match(page, /done.*completed/s)
  assert.match(page, /function currentStatus\(d\) \{ return d\.status \|\| 'draft' \}/)
  assert.match(page, /function setDramaStatus/)
  assert.match(page, /dramaAPI\.update\(d\.id, \{ status \}\)/)
  assert.match(page, /statusMenuId/)
  // filtering and stats use manual status
  assert.match(page, /currentStatus\(d\) === statusFilter\.value/)
  assert.match(page, /currentStatus\(d\) === 'active'/)
  // auto-derived status removed: no progress bar, no episodes.length derivation
  assert.doesNotMatch(page, /getProgress/)
  assert.doesNotMatch(page, /d\.episodes\?\.length \? 'In progress' : 'Not started'/)
})

test('project launcher keeps controls simple', () => {
  assert.match(page, /Search projects/)
  assert.match(page, /New project/)
  assert.doesNotMatch(page, /Episode list/)
  assert.doesNotMatch(page, /Production queue/)
  assert.doesNotMatch(page, /Recent activity/)
})

test('create dialog fixes aspect ratio at project creation', () => {
  assert.match(page, /aspect ratio/)
  assert.match(page, /form\.aspect_ratio/)
  assert.match(page, /aspectRatioOptions/)
  assert.match(page, /aspect_ratio: '16:9'/)
  assert.match(page, /Fixed at creation/)
  assert.match(page, /16:9 · landscape/)
  assert.match(page, /9:16 · portrait/)
  assert.match(page, /1:1 · square/)
  assert.doesNotMatch(page, /Planned episodes/)
})

test('global buttons use the apple-inspired action palette', () => {
  assert.match(studioCss, /--action-primary:\s*#0071e3/)
  assert.match(studioCss, /--action-secondary:\s*#e8e8ed/)
  assert.match(studioCss, /--action-danger:\s*#ff3b30/)
  assert.match(studioCss, /\.btn-primary\s*\{/)
})
