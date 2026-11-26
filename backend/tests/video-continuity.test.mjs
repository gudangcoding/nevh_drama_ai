import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('merge trims baked-in edge fades before hard-cut concat', () => {
  const merge = read('src/services/ffmpeg-merge.ts')

  // Deteksi fade hitam di ujung klip, bukan concat mentah
  assert.match(merge, /detectBlackEdges/)
  assert.match(merge, /blackdetect/)
  // Trim per klip + concat via filter (bukan concat demuxer)
  assert.match(merge, /trim=start=/)
  assert.match(merge, /concat=n=/)
  assert.match(merge, /complexFilter/)
  // Subtitle memakai durasi setelah trim agar timing sinkron
  assert.match(merge, /clipDurations/)
  const subs = read('src/services/subtitles.ts')
  assert.match(subs, /clipDurations\?: number\[\]/)
})

test('video generation chains previous shot last frame as reference', () => {
  const svc = read('src/services/generation.ts')

  assert.match(svc, /resolveChainFrame/)
  assert.match(svc, /extractVideoLastFrame/)
  // first_frame untuk provider yang mendukung berdampingan dengan referensi,
  // fallback gambar referensi untuk yang lain; Wan dikecualikan (mode eksklusif)
  assert.match(svc, /CHAIN_FIRST_FRAME_PROVIDERS/)
  assert.match(svc, /firstFrameUrl = chainFrame/)
  const poster = read('src/utils/video-poster.ts')
  assert.match(poster, /extractVideoLastFrame/)
  assert.match(poster, /detectBlackEdges/)
})

test('video prompts forbid fades and require continuous action', () => {
  for (const f of [
    'workspace/prompts/storyboard_breaker.id.md',
    'workspace/prompts/storyboard_breaker.en.md',
    'workspace/prompts/prompt_generator.id.md',
    'workspace/prompts/prompt_generator.en.md',
  ]) {
    const content = read(f)
    assert.match(content, /fade/i)
  }
  const svc = read('src/services/production.ts')
  assert.match(svc, /hard cut, bukan fade/)
  const batch = read('src/services/video-prompts.ts')
  assert.match(batch, /keadaan akhir segmen sebelumnya = keadaan awal segmen berikutnya/)
})
