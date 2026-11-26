import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('project creation dialog only asks for title and visual style', () => {
  const page = read('app/pages/index.vue')

  assert.match(page, /New project/)
  assert.match(page, /Visual style/)
  assert.doesNotMatch(page, /total_episodes/)
  assert.doesNotMatch(page, /Planned episodes/)
  // hard-coded style list removed; presets come from the API
  assert.doesNotMatch(page, /\['realistic', 'anime'/)
  assert.match(page, /stylePresetAPI/)
  assert.match(page, /stylePresetAPI\.list\(\)/)
  assert.match(page, /styleLabel\(d\.style\)/)
  assert.match(page, /stylePresets\.length \}\} visual styles/)
})

test('useApi exposes style preset endpoints', () => {
  const useApi = read('app/composables/useApi.ts')

  assert.match(useApi, /stylePresetAPI/)
  assert.match(useApi, /\/style-presets/)
  assert.match(useApi, /\?all=1/)
})

test('settings page manages style presets in a base tab', () => {
  const settings = read('app/pages/settings.vue')

  assert.match(settings, /Style presets/)
  assert.match(settings, /Palette/)
  assert.match(settings, /stylePresetAPI/)
  assert.match(settings, /\{ id: 'styles', label: 'Style presets'/)
  assert.match(settings, /startAddStyle/)
  assert.match(settings, /startEditStyle/)
  assert.match(settings, /toggleStyle/)
  assert.match(settings, /confirmDelStyle/)
  assert.match(settings, /styleToDelete/)
  assert.match(settings, /<ConfirmDialog/)
  assert.match(settings, /loadStylePresets/)
  // turning off advanced resets only advanced tabs, not base tabs
  assert.match(settings, /advancedTabs\.some/)
  assert.doesNotMatch(settings, /if \(!v && tab\.value !== 'ai'\)/)
  // style key is read-only when editing
  assert.match(settings, /:disabled="!!styleEditId"/)
  // image_prompt_generator default prompt copy kept in sync
  assert.doesNotMatch(settings, /must contain "consistent art style"/)
})
