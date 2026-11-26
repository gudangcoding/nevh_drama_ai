import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('prompt_generator video prompt format uses @name references instead of XML tags', () => {
  const agents = read('src/agents/index.ts')
  const skill = read('workspace/skills/prompt-generator/video-prompt/SKILL.md')
  const settings = read('../frontend/app/pages/settings.vue')

  // Scenes/characters are referenced by @name (names must exactly match the lists)
  assert.match(agents, /@SceneName/)
  assert.match(agents, /@CharacterName/)
  assert.match(agents, /@Xiaoming -> @Gambar1Xiaoming/)
  assert.doesNotMatch(agents, /<location>/)
  assert.doesNotMatch(agents, /<role>/)

  // SKILL.md stays in sync
  assert.match(skill, /@NamaAdegan/)
  assert.match(skill, /@NamaKarakter/)
  assert.match(skill, /@Xiaoming.*@Gambar1Xiaoming/)
  assert.doesNotMatch(skill, /<location>/)
  assert.doesNotMatch(skill, /<role>/)

  // The default-prompt copy in settings.vue follows the same format rules
  assert.match(settings, /storyboard_breaker: `/)
  assert.match(settings, /@SceneName/)
  assert.match(settings, /@CharacterName/)
  assert.match(settings, /@Xiaoming -> @Gambar1Xiaoming/)
  assert.doesNotMatch(settings, /<location>/)
  assert.doesNotMatch(settings, /<role>/)
})
