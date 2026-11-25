import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

const page = read('app/pages/drama/[id]/episode/[episodeNumber].vue')
const useAgent = read('app/composables/useAgent.ts')
const useApi = read('app/composables/useApi.ts')

test('workbench offers model selectors for rewrite, image and video generation', () => {
  // three selectors (custom ModelSelect popover, not native select)
  assert.match(page, /<ModelSelect/)
  assert.match(page, /v-model="chatModel"/)
  assert.match(page, /v-model="imageModel"/)
  assert.match(page, /v-model="videoModel"/)
  assert.doesNotMatch(page, /<select v-model="chatModel"/)
  // options aggregate models from all active configs (deduped, by priority); API may return an array
  assert.match(page, /function collectModelOptions\(cfgs\)/)
  assert.match(page, /if \(Array\.isArray\(raw\)\) return raw\.filter\(Boolean\)/)
  assert.match(page, /collectModelOptions\(textConfigs\.value\)/)
  assert.match(page, /collectModelOptions\(imageConfigs\.value\)/)
  assert.match(page, /collectModelOptions\(videoConfigs\.value\)/)
  assert.match(page, /aiConfigAPI\.list\('text'\)/)
})

test('model select dropdown is a custom designed popover', () => {
  const component = read('app/components/ModelSelect.vue')

  assert.match(component, /Teleport to="body"/)
  assert.match(component, /model-select-menu/)
  assert.match(component, /model-select-option/)
  assert.match(component, /Check :size="12"/)
  assert.match(component, /model-select-backdrop/)
  assert.match(component, /emit\('update:modelValue', model\)/)
  // show the source config name with multiple configs
  assert.match(component, /showConfig/)
  assert.match(component, /opt-config/)
})

test('selected models are sent with rewrite, image and video generation requests', () => {
  // call with the owning config when a model is selected
  assert.match(page, /function ownerConfigId\(options, model\)/)
  // rewrite (Agent) passes model and config through
  assert.match(useAgent, /model: model \|\| undefined/)
  assert.match(useAgent, /config_id: configId \|\| undefined/)
  assert.match(page, /runAgent\('script_rewriter'[\s\S]*?chatModelOverride\(\), chatConfigId\(\)\)/)
  // image generation passes model and config through
  assert.match(useApi, /generateImage: \(id: number, episodeId: number, model\?: string, configId\?: number, textModel\?: string, textConfigId\?: number\)/)
  // text model override is passed with image/extraction requests (backend triggers the prompt Agent when a prompt is missing)
  assert.match(useApi, /text_model: textModel \|\| undefined/)
  assert.match(useApi, /text_config_id: textConfigId \|\| undefined/)
  assert.match(useApi, /config_id: configId \|\| undefined/)
  assert.match(page, /characterAPI\.generateImage\(id, epId\.value, imageModel\.value \|\| undefined, ownerConfigId\(imageModelOptions\.value, imageModel\.value\), chatModelOverride\(\), chatConfigId\(\)\)/)
  assert.match(page, /sceneAPI\.generateImage\(id, epId\.value, imageModel\.value \|\| undefined, ownerConfigId\(imageModelOptions\.value, imageModel\.value\), chatModelOverride\(\), chatConfigId\(\)\)/)
  assert.match(page, /characterAPI\.batchImages\(ids, epId\.value, imageModel\.value \|\| undefined, ownerConfigId\(imageModelOptions\.value, imageModel\.value\), chatModelOverride\(\), chatConfigId\(\)\)/)
  // video generation passes model and config through
  assert.match(page, /model: videoModel\.value \|\| undefined/)
  assert.match(page, /config_id: ownerConfigId\(videoModelOptions\.value, videoModel\.value\)/)
})
