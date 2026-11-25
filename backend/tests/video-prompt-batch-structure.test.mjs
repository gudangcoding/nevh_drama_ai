import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('video prompt batch service runs per-shot async agent loop', () => {
  const svc = read('src/services/video-prompts.ts')

  // \u9ed8\u8ba4\u53ea\u5904\u7406\u7f3a\u5c11 video_prompt \u7684\u5206\u955c；\u6307\u5b9a storyboardIds \u65f6\u53ea\u5904\u7406\u6240\u9009（\u5df2\u6709\u63d0\u793a\u8bcd\u4e5f\u91cd\u65b0\u751f\u6210）
  assert.match(svc, /filter\(sb => !\(sb\.videoPrompt \|\| ''\)\.trim\(\)\)/)
  assert.match(svc, /storyboardIds\?\.length/)
  assert.match(svc, /storyboardIds\.includes\(sb\.id\)/)
  // \u8fd0\u884c\u4e2d\u4e0d\u91cd\u590d\u542f\u52a8
  assert.match(svc, /status === 'running'\) return \{ started: false, total: -1 \}/)
  // \u9010\u4e2a\u5206\u955c\u8c03\u7528 prompt_generator，\u4ee5\u843d\u5e93\u7ed3\u679c\u5224\u5b9a\u6210\u8d25
  assert.match(svc, /mastra\.getAgent\('prompt_generator'\)/)
  assert.match(svc, /read_storyboard_context/)
  assert.match(svc, /update_storyboard/)
  assert.match(svc, /fresh\?\.videoPrompt/)
  // \u8fdb\u5ea6\u8ddf\u8e2a\u4e0e\u6587\u672c\u6a21\u578b\u8986\u76d6
  assert.match(svc, /current_storyboard_id/)
  assert.match(svc, /modelOverride: opts\.model/)
})

test('episodes route exposes video prompt batch endpoints', () => {
  const route = read('src/routes/episodes.ts')

  assert.match(route, /app\.post\('\/:id\/generate-video-prompts'/)
  assert.match(route, /app\.get\('\/:id\/video-prompts-status'/)
  assert.match(route, /startVideoPromptBatch\(ep\.id, ep\.dramaId/)
  assert.match(route, /body\.storyboard_ids/)
  assert.match(route, /already_running/)
})
