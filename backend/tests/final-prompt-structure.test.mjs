import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('characters and scenes tables store the agent-written final prompt', () => {
  const schema = read('src/db/schema.ts')
  const mysql = read('src/db/mysql-schema.ts')

  // Drizzle \u8868\u5b9a\u4e49
  assert.match(schema, /export const characters = mysqlTable\('characters'[\s\S]*?finalPrompt: text\('final_prompt'\)/)
  assert.match(schema, /export const scenes = mysqlTable\('scenes'[\s\S]*?finalPrompt: text\('final_prompt'\)/)
  // \u65b0\u5efa\u8868 DDL + \u5b58\u91cf\u8868 backfill
  assert.match(mysql, /CREATE TABLE IF NOT EXISTS characters \([\s\S]*?final_prompt TEXT/)
  assert.match(mysql, /CREATE TABLE IF NOT EXISTS scenes \([\s\S]*?final_prompt TEXT/)
  assert.match(mysql, /table: 'characters', column: 'final_prompt'/)
  assert.match(mysql, /table: 'scenes', column: 'final_prompt'/)
})

test('grid prompt agent tools save agent-written final prompts with style injection', () => {
  const tools = read('src/agents/tools/image-prompt-tools.ts')

  assert.match(tools, /save_character_final_prompt/)
  assert.match(tools, /save_scene_final_prompt/)
  // \u4fdd\u5b58\u65f6\u6ce8\u5165\u9879\u76ee\u89c6\u89c9\u98ce\u683c\u5e76\u843d\u5e93
  assert.match(tools, /getDramaStylePrompt/)
  assert.match(tools, /set\(\{ finalPrompt, updatedAt: now\(\) \}\)/)
  // \u63d0\u793a\u8bcd\u7531 Agent \u521b\u4f5c，\u4e0d\u518d\u7531\u5de5\u5177\u673a\u68b0\u62fc\u63a5
  assert.doesNotMatch(tools, /generate_character_prompt/)
  assert.doesNotMatch(tools, /generate_scene_prompt/)
})

test('prompt agent instructions reference per-asset skills; skill files define the specs', () => {
  const agents = read('src/agents/index.ts')
  const settings = read('../frontend/app/pages/settings.vue')
  const charSkill = read('workspace/skills/prompt-generator/character-prompt/SKILL.md')
  const sceneSkill = read('workspace/skills/prompt-generator/scene-prompt/SKILL.md')

  for (const src of [agents, settings]) {
    // Three asset prompt specs (details live in the respective SKILL.md)
    assert.match(src, /turnaround|three-view/)
    assert.match(src, /fixed.angle/)
    assert.match(src, /white-background/)
    // Save tool contract
    assert.match(src, /save_character_final_prompt/)
    assert.match(src, /save_scene_final_prompt/)
  }
  // Required elements for character/scene prompts are defined in the skill files (session language output)
  assert.match(charSkill, /close-up wajah depan/)
  assert.match(charSkill, /depan, samping 90 derajat, dan belakang/)
  assert.match(charSkill, /wajah, potongan rambut, dan pakaian/)
  assert.match(charSkill, /direktif bahasa sesi/)
  assert.match(sceneSkill, /establishing shot sudut lebar/)
  assert.match(sceneSkill, /latar depan/)
  assert.match(sceneSkill, /latar tengah/)
  assert.match(sceneSkill, /latar belakang/)
  assert.match(sceneSkill, /pintu masuk\/keluar/)
  assert.match(sceneSkill, /direktif bahasa sesi/)
})

test('image generation prefers the stored final prompt with agent generation and legacy fallback', () => {
  const service = read('src/services/final-prompt.ts')
  const characters = read('src/routes/characters.ts')
  const scenes = read('src/routes/scenes.ts')

  assert.match(service, /export async function ensureCharacterFinalPrompt/)
  assert.match(service, /export async function ensureSceneFinalPrompt/)
  assert.match(service, /getAgent\('prompt_generator'/)
  // \u5df2\u6709\u6700\u7ec8\u63d0\u793a\u8bcd\u76f4\u63a5\u590d\u7528（force \u65f6\u5ffd\u7565\u5f3a\u5236\u91cd\u65b0\u751f\u6210）
  assert.match(service, /if \(char\.finalPrompt && !force\) return char\.finalPrompt/)
  assert.match(service, /if \(scene\.finalPrompt && !force\) return scene\.finalPrompt/)
  assert.match(service, /force = false/)

  assert.match(characters, /ensureCharacterFinalPrompt\(char, ep\.id, /)
  // \u6587\u672c\u6a21\u578b\u8986\u76d6（text_model/text_config_id）\u900f\u4f20\u5230\u63d0\u793a\u8bcd Agent
  assert.match(characters, /text_model/)
  assert.match(characters, /finalPrompt \|\| characterImagePrompt\(char, stylePrompt\)/)
  assert.match(scenes, /ensureSceneFinalPrompt\(scene, ep\.id, /)
  // \u63cf\u8ff0\u5b57\u6bb5\u7f16\u8f91\u540e\u6700\u7ec8\u63d0\u793a\u8bcd\u5931\u6548
  assert.match(characters, /updates\.finalPrompt = null/)
  assert.match(scenes, /updates\.finalPrompt = null/)
})
