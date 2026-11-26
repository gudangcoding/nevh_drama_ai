import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('drama creation stores total_episodes and pre-creates episodes only via auto production', () => {
  const dramas = read('src/routes/dramas.ts')

  // total_episodes disimpan; episode pra-buat hanya lewat startProduction saat auto_generate + sinopsis
  assert.match(dramas, /totalEpisodes: body\.total_episodes \|\| 1/)
  assert.match(dramas, /startProduction\(dramaId, \{ auto_video: !!body\.auto_video \}\)/)
  assert.match(dramas, /body\.auto_generate \|\| body\.autoGenerate/)
  // tanpa auto_generate handler tidak langsung memanggil jalur pembuatan episode
  assert.doesNotMatch(dramas, /\u7b2c\$\{i\}\u96c6/)
  assert.doesNotMatch(dramas, /Create default episodes/)
})

test('drama creation records a fixed aspect ratio for video generation', () => {
  const dramas = read('src/routes/dramas.ts')

  assert.match(dramas, /aspectRatio: body\.aspect_ratio \|\| '16:9'/)
  assert.match(dramas, /if \(body\.aspect_ratio !== undefined\) updates\.aspectRatio = body\.aspect_ratio/)
})

test('style presets route is mounted and implements CRUD', () => {
  const entry = read('src/index.ts')
  const route = read('src/routes/stylePresets.ts')

  assert.match(entry, /api\.route\('\/style-presets', stylePresets\)/)
  assert.match(route, /app\.get\('\/'/)
  assert.match(route, /app\.post\('\/'/)
  assert.match(route, /app\.put\('\/:id'/)
  assert.match(route, /app\.delete\('\/:id'/)
  // value \u552f\u4e00\u7ea6\u675f + \u683c\u5f0f\u6821\u9a8c + \u67e5\u91cd
  assert.match(route, /VALUE_PATTERN/)
  assert.match(route, /\u98ce\u683c key \u5df2\u5b58\u5728/)
  // GET \u652f\u6301 ?all=1 \u4e14\u9ed8\u8ba4\u8fc7\u6ee4\u505c\u7528\u9879
  assert.match(route, /query\('all'\)/)
  assert.match(route, /r\.isActive/)
})

test('drama style prompt is injected into image prompt composition', () => {
  const service = read('src/services/style-preset.ts')
  const gridTools = read('src/agents/tools/image-prompt-tools.ts')
  const characters = read('src/routes/characters.ts')
  const scenes = read('src/routes/scenes.ts')

  assert.match(service, /getDramaStylePrompt/)
  assert.match(service, /stylePresets\.value, drama\.style/)
  assert.match(gridTools, /getDramaStylePrompt\(dramaId\)/)
  // Final prompt style prefix is assembled by the tool (style segment placed first)
  assert.match(gridTools, /stylePrompt \? `\$\{stylePrompt\}, \$\{prompt\}` : prompt/)
  assert.match(characters, /getDramaStylePrompt/)
  assert.match(characters, /characterImagePrompt\(char, stylePrompt\)/)
  assert.match(scenes, /getDramaStylePrompt\(scene\.dramaId\)/)
})

test('agent default prompts no longer hardcode consistent art style', () => {
  const agents = read('src/agents/index.ts')

  assert.doesNotMatch(agents, /must include "consistent art style"/)
  assert.match(agents, /The project visual style description is automatically injected/)
})
