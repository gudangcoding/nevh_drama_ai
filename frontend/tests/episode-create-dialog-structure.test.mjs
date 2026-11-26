import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('add episode dialog asks for a title and a fixed video resolution', () => {
  const page = read('app/pages/drama/[id]/index.vue')

  // image/video service picker UI removed
  assert.doesNotMatch(page, /Image generation service/)
  assert.doesNotMatch(page, /Video generation service/)
  assert.doesNotMatch(page, /svc-card/)
  assert.doesNotMatch(page, /svc-pick/)
  assert.doesNotMatch(page, /imageConfigs|videoConfigs/)
  assert.doesNotMatch(page, /Config will be locked/)
  assert.doesNotMatch(page, /Create and lock config/)

  // keep the title input and submit
  assert.match(page, /v-model="newEpisodeTitle"/)
  assert.match(page, /placeholder="Auto-named by episode number by default"/)
  assert.match(page, /leave empty to auto-name by episode number/)
  assert.match(page, /active image/video generation capabilities are locked at creation/)
  assert.match(page, /creatingEpisode \? 'Creating\.\.\.' : 'Create'/)

    // Video resolution: fixed at creation (480p/720p, default 720p)
  assert.match(page, /Video resolution/)
  assert.match(page, /v-model="newEpisodeResolution"/)
  assert.match(page, /const resolutionOptions = \[/)
  assert.match(page, /720p · HD/)
  assert.match(page, /480p · Smooth/)
  assert.match(page, /newEpisodeResolution = ref\('720p'\)/)
  assert.match(page, /can still be changed on the episode card/)
})

test('addEpisode posts drama_id, title and resolution', () => {
  const page = read('app/pages/drama/[id]/index.vue')

  const addEpisodeBody = page.slice(page.indexOf('async function addEpisode'), page.indexOf('onMounted(load)'))
  assert.match(addEpisodeBody, /drama_id: dramaId/)
  assert.match(addEpisodeBody, /title: newEpisodeTitle\.value/)
  assert.match(addEpisodeBody, /resolution: newEpisodeResolution\.value/)
  assert.doesNotMatch(addEpisodeBody, /image_config_id/)
  assert.doesNotMatch(addEpisodeBody, /video_config_id/)
  assert.doesNotMatch(addEpisodeBody, /aiConfigAPI/)
})

test('episode card resolution is editable via a dropdown persisted to episodes.resolution', () => {
  const page = read('app/pages/drama/[id]/index.vue')

  // resolution badge on the card + dropdown edit
  assert.match(page, /Click to change this episode's video resolution/)
  assert.match(page, /epResMenuId/)
  assert.match(page, /function epResolution\(ep\) \{ return ep\.resolution === '480p' \? '480p' : '720p' \}/)
  assert.match(page, /function setEpisodeResolution/)
  assert.match(page, /episodeAPI\.update\(ep\.id, \{ resolution \}\)/)
})

test('add episode dialog does not preload config lists', () => {
  const page = read('app/pages/drama/[id]/index.vue')

  assert.doesNotMatch(page, /loadConfigs/)
  assert.doesNotMatch(page, /aiConfigAPI\.list/)
  assert.doesNotMatch(page, /canCreateEpisode/)
})