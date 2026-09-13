import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('error-translate utility exists and is applied at every user-facing error surface', () => {
  const util = read('src/utils/error-translate.ts')
  const prod = read('src/services/production.ts')
  const gen = read('src/services/generation.ts')
  const extract = read('src/services/extraction.ts')
  const vp = read('src/services/video-prompts.ts')
  const merge = read('src/services/ffmpeg-merge.ts')
  const epsRoute = read('src/routes/episodes.ts')
  const tasksRoute = read('src/routes/tasks.ts')

  // Utility menerjemahkan pesan Cina + menyediakan fallback generik Indonesia
  assert.match(util, /translateApiError/)
  assert.match(util, /HAS_CJK/)
  assert.match(util, /'Saldo layanan AI tidak mencukupi/)
  assert.match(util, /GENERIC_CN/)

  // describeApiError: menerjemahkan objek error Agent/AI SDK — membaca statusCode/url dan
  // mengubah pesan mentah "Failed to process error response" menjadi pesan + petunjuk yang bisa ditindaklanjuti
  assert.match(util, /export function describeApiError/)
  assert.match(util, /STATUS_HINTS/)
  assert.match(util, /statusCode/)
  assert.match(util, /unwraps?|unwrapError/i)

  // Diterapkan di tempat pesan API eksternal disimpan/ditampilkan
  assert.match(prod, /const message = describeApiError\(err\)/)
  assert.match(prod, /translateApiError\(task\.errorMsg/)
  assert.match(prod, /translateApiError\(st\.error/)
  assert.match(prod, /translateApiError\(batch\.error/)
  assert.match(prod, /error_msg: job\.errorMsg \? translateApiError/)
  assert.match(gen, /failTask\(id: number, message: string\)[\s\S]*?const translated = translateApiError\(message\)/)
  assert.match(extract, /task\.error = describeApiError\(err\)/)
  assert.match(extract, /describeApiError/)
  assert.match(vp, /task\.error = describeApiError\(err\)/)
  assert.match(merge, /errorMsg: translateApiError\(err\.message\)/)
  assert.match(epsRoute, /translateApiError\(t\.errorMsg\)/)
  assert.match(tasksRoute, /translateApiError\(err\.message\)/)
})