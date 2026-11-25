import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const appRoot = new URL('../app/', import.meta.url)
const readApp = (path) => readFileSync(new URL(path, appRoot), 'utf8')

const episodePage = readApp('pages/drama/[id]/episode/[episodeNumber].vue')
const dramaPage = readApp('pages/drama/[id]/index.vue')
const settingsPage = readApp('pages/settings.vue')
const useApi = readApp('composables/useApi.ts')

test('frontend API client no longer exposes TTS or voice endpoints', () => {
  assert.doesNotMatch(useApi, /generateTTS/)
  assert.doesNotMatch(useApi, /voiceSample/)
  assert.doesNotMatch(useApi, /voicesAPI/)
  assert.doesNotMatch(useApi, /ai-voices/)
  assert.doesNotMatch(useApi, /generate-voice-sample/)
  assert.doesNotMatch(useApi, /generate-tts/)
})

test('episode workbench removes all role voice assignment controls', () => {
  assert.doesNotMatch(episodePage, /voice_assigner/)
  assert.doesNotMatch(episodePage, /AI voice matching/)
  assert.doesNotMatch(episodePage, /Batch preview/)
  assert.doesNotMatch(episodePage, /Character voice/)
  assert.doesNotMatch(episodePage, /Assigned voice/)
  assert.doesNotMatch(episodePage, /Voice pending/)
  assert.doesNotMatch(episodePage, /asset-detail-voice-panel/)
  assert.doesNotMatch(episodePage, /updateCharVoice/)
  assert.doesNotMatch(episodePage, /previewVoiceSample/)
  assert.doesNotMatch(episodePage, /voiceProfiles/)
  assert.doesNotMatch(episodePage, /audioConfigs/)
  assert.doesNotMatch(episodePage, /voicesAPI/)
})

test('project and settings pages remove audio service configuration', () => {
  assert.doesNotMatch(dramaPage, /audio_config_id/)
  assert.doesNotMatch(dramaPage, /audioConfigs/)
  assert.doesNotMatch(dramaPage, /Audio/)
  assert.doesNotMatch(settingsPage, /voice_assigner/)
  assert.doesNotMatch(settingsPage, /Voice assignment/)
  assert.doesNotMatch(settingsPage, /serviceTypes[\s\S]*audio/)
  assert.doesNotMatch(settingsPage, /Audio/)
  assert.doesNotMatch(settingsPage, /speech-2\.8-hd/)
})
