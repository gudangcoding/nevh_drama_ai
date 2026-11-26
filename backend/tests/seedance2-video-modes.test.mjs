import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('volcengine video adapter only supports Seedance 2.0 models and reference mode only', () => {
  const adapter = read('src/services/adapters/volcengine-video.ts')

  // \u6a21\u578b\u767d\u540d\u5355：\u4ec5 doubao-seedance-2-0-* \u524d\u7f00
  assert.match(adapter, /SEEDANCE2_MODEL_PREFIX = 'doubao-seedance-2-0'/)
  assert.match(adapter, /startsWith\(SEEDANCE2_MODEL_PREFIX\)/)

  // \u53ea\u4fdd\u7559\u591a\u6a21\u6001\u53c2\u8003：\u5176\u4ed6\u6a21\u5f0f\u5206\u652f\u4e0e\u5386\u53f2\u6620\u5c04\u5df2\u6e05\u7406
  assert.doesNotMatch(adapter, /mode === 'text'/)
  assert.doesNotMatch(adapter, /mode === 'first_frame'/)
  assert.doesNotMatch(adapter, /mode === 'first_last'/)
  assert.doesNotMatch(adapter, /LEGACY_MODE_MAP/)
  assert.doesNotMatch(adapter, /first_frame/)
  assert.doesNotMatch(adapter, /last_frame/)

  // \u591a\u6a21\u6001 content \u9879\u89d2\u8272
  assert.match(adapter, /role: 'reference_image'/)
  assert.match(adapter, /role: 'reference_video'/)
  assert.match(adapter, /role: 'reference_audio'/)

  // \u7d20\u6750\u4e0a\u9650 9/3/3、\u97f3\u9891\u9700\u89c6\u89c9\u7d20\u6750\u7ea6\u675f、\u81f3\u5c11\u4e00\u4e2a\u7d20\u6750\u6216 prompt
  assert.match(adapter, /REF_LIMITS = \{ images: 9, videos: 3, audios: 3 \}/)
  assert.match(adapter, /Audio referensi membutuhkan minimal 1 gambar atau video referensi/)
  assert.match(adapter, /\u591a\u6a21\u6001\u53c2\u8003\u6a21\u5f0f\u9700\u8981\u81f3\u5c11\u4e00\u4e2a\u53c2\u8003\u7d20\u6750\u6216 prompt/)

  // generate_audio \u53ef\u914d\u7f6e（\u9ed8\u8ba4\u5f00），\u65f6\u957f\u652f\u6301 4-15 \u79d2；\u5206\u8fa8\u7387\u968f\u96c6\u56fa\u5b9a（480p/720p，\u9ed8\u8ba4 720p）
  assert.match(adapter, /generate_audio:\s*record\.generateAudio/)
  assert.match(adapter, /Math\.min\(15, Math\.max\(4, parsed\)\)/)
  assert.match(adapter, /resolution: record\.resolution === '480p' \? '480p' : '720p'/)
})

test('video generation service resolves reference media and persists new fields', () => {
  const service = read('src/services/generation.ts')

  assert.match(service, /PUBLIC_BASE_URL/)
  assert.match(service, /resolvePublicMediaUrl/)
  assert.match(service, /referenceVideoUrls: params\.referenceVideoUrls/)
  assert.match(service, /referenceAudioUrls: params\.referenceAudioUrls/)
  assert.match(service, /generateAudio: params\.generateAudio === false \? 0 : 1/)
  // \u9ed8\u8ba4\u591a\u6a21\u6001\u53c2\u8003\u6a21\u5f0f
  assert.match(service, /referenceMode: params\.referenceMode \|\| 'reference'/)
  assert.doesNotMatch(service, /referenceMode: params\.referenceMode \|\| 'text'/)
  assert.doesNotMatch(service, /referenceMode: params\.referenceMode \|\| 'none'/)
})

test('video resolution is fixed per episode, editable, and locked into video tasks', () => {
  const episodes = read('src/routes/episodes.ts')
  const tasks = read('src/routes/tasks.ts')
  const service = read('src/services/generation.ts')

  // \u521b\u5efa\u96c6\u65f6\u56fa\u5b9a（\u9ed8\u8ba4 720p，\u4ec5\u63a5\u53d7 480p/720p）
  assert.match(episodes, /\['480p', '720p', '1080p'\]\.includes\(body\.resolution\)/)
  // PUT \u53ef\u4fee\u6539，\u767d\u540d\u5355\u6821\u9a8c
  assert.match(episodes, /'status', 'resolution'\]/)
  assert.match(episodes, /resolution hanya mendukung 480p \/ 720p/)
  // \u89c6\u9891\u4efb\u52a1\u9501\u5b9a\u96c6\u7684\u5206\u8fa8\u7387（\u4f18\u5148\u4e8e\u8bf7\u6c42\u4f53）
  assert.match(tasks, /episodeResolution = ep\.resolution/)
  assert.match(tasks, /resolution: episodeResolution \|\| videoBody!\.resolution/)
  // \u670d\u52a1\u843d\u5165 params \u5e76\u4f20\u7ed9\u9002\u914d\u5668
  assert.match(service, /resolution: normalizeStoredVideoResolution\(params\.resolution\)/)
  assert.match(service, /resolution: params\.resolution,/)
})

test('upload route exposes validated video and audio endpoints', () => {
  const route = read('src/routes/upload.ts')

  assert.match(route, /app\.post\('\/video'/)
  assert.match(route, /app\.post\('\/audio'/)
  assert.match(route, /VIDEO_EXT = new Set\(\['\.mp4', '\.mov', '\.webm', '\.m4v'\]\)/)
  assert.match(route, /AUDIO_EXT = new Set\(\['\.mp3', '\.wav', '\.m4a', '\.aac'\]\)/)
  assert.match(route, /50 \* 1024 \* 1024/)
  assert.match(route, /20 \* 1024 \* 1024/)
})

test('tasks route validates reference-mode requirements for video tasks', () => {
  const route = read('src/routes/tasks.ts')

  // \u7edf\u4e00\u4efb\u52a1\u5165\u53e3：type \u5206\u6d3e image/video
  assert.match(route, /type harus image atau video/)
  assert.match(route, /generateImage\(\{/)
  assert.match(route, /generateVideo\(\{/)

  // \u5176\u4ed6\u6a21\u5f0f\u7684\u6821\u9a8c\u5df2\u6e05\u7406
  assert.doesNotMatch(route, /\u6587\u751f\u89c6\u9891\u6a21\u5f0f\u5fc5\u987b\u63d0\u4f9b prompt/)
  assert.doesNotMatch(route, /\u9996\u5e27\u6a21\u5f0f\u5fc5\u987b\u63d0\u4f9b first_frame_url/)
  assert.doesNotMatch(route, /\u9996\u5c3e\u5e27\u6a21\u5f0f\u5fc5\u987b\u540c\u65f6\u63d0\u4f9b/)
  // Wan 3.0 \u5b98\u65b9\u5165\u53c2\u517c\u5bb9\u5c42\u4f1a\u628a input.media \u5f52\u4e00\u5230 first_frame_url/last_frame_url \u7b49\u6241\u5e73\u5b57\u6bb5

  // \u591a\u6a21\u6001\u53c2\u8003\u6821\u9a8c\u5e76\u56fa\u5b9a reference \u6a21\u5f0f
  assert.match(route, /Batas media referensi terlampaui: gambar≤9, video≤3, audio≤3/)
  assert.match(route, /Audio referensi membutuhkan minimal 1 gambar atau video referensi/)
  assert.match(route, /Pembuatan video membutuhkan minimal satu media referensi atau prompt/)
  assert.match(route, /referenceMode: 'reference'/)
  assert.match(route, /referenceVideoUrls: videoBody!\.reference_video_urls/)
  assert.match(route, /referenceAudioUrls: videoBody!\.reference_audio_urls/)
  assert.match(route, /generateAudio: videoBody!\.generate_audio/)
})

test('image/video generation tasks are unified into a single sys_task table', () => {
  const schema = read('src/db/schema.ts')
  const mysqlSchema = read('src/db/mysql-schema.ts')
  const envExample = read('.env.example')

  // sys_task：type \u533a\u5206 image/video，\u751f\u6210\u53c2\u6570\u6536\u8fdb params(JSON)
  assert.match(schema, /export const sysTask = mysqlTable\('sys_task'/)
  assert.match(schema, /type: varchar\('type', \{ length: 16 \}\)\.notNull\(\)/)
  assert.match(schema, /params: text\('params'\)/)
  assert.match(schema, /resultUrl: text\('result_url'\)/)
  assert.match(schema, /localPath: text\('local_path'\)/)

  // \u65e7\u7684 image_generations / video_generations \u8868\u5b9a\u4e49\u4e0e\u56de\u586b\u5df2\u79fb\u9664
  assert.doesNotMatch(schema, /imageGenerations/)
  assert.doesNotMatch(schema, /videoGenerations/)
  assert.doesNotMatch(mysqlSchema, /CREATE TABLE IF NOT EXISTS image_generations/)
  assert.doesNotMatch(mysqlSchema, /CREATE TABLE IF NOT EXISTS video_generations/)
  assert.doesNotMatch(mysqlSchema, /column: 'reference_video_urls'/)

  // DDL \u4e0e\u65e7\u8868\u6e05\u7406（\u4e0d\u8fc1\u79fb\u5386\u53f2）
  assert.match(mysqlSchema, /CREATE TABLE IF NOT EXISTS sys_task \(/)
  assert.match(mysqlSchema, /type VARCHAR\(16\) NOT NULL/)
  assert.match(mysqlSchema, /params TEXT/)
  assert.match(mysqlSchema, /result_url TEXT/)
  assert.match(mysqlSchema, /DROP TABLE IF EXISTS `image_generations`/)
  assert.match(mysqlSchema, /DROP TABLE IF EXISTS `video_generations`/)

  // \u8def\u7531\u4e0e\u670d\u52a1\u53ea\u64cd\u4f5c sys_task（\u7edf\u4e00 /tasks \u5165\u53e3，type \u8fc7\u6ee4）
  const tasksRoute = read('src/routes/tasks.ts')
  const service = read('src/services/generation.ts')
  assert.match(tasksRoute, /schema\.sysTask/)
  assert.match(tasksRoute, /r\.type === type/)
  assert.match(service, /db\.insert\(schema\.sysTask\)/)

  assert.match(envExample, /PUBLIC_BASE_URL/)
})
