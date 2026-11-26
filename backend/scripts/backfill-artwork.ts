/**
 * \u5b58\u91cf\u6587\u4ef6\u56de\u586b\u811a\u672c — \u4e3a\u5386\u53f2\u751f\u6210\u7684\u56fe\u7247/\u89c6\u9891\u8865\u751f\u6210\u7f29\u7565\u56fe\u548c\u6d77\u62a5\u5e27
 *
 * \u7528\u6cd5：cd backend && npx tsx scripts/backfill-artwork.ts
 *
 * \u626b\u63cf data/static \u4e0b：
 *   images/  → \u4e3a\u7f3a\u5c11 *_thumb.webp \u7684\u56fe\u7247\u751f\u6210\u7f29\u7565\u56fe（\u5bbd 400 WebP）
 *   videos/、merged/ → \u4e3a\u7f3a\u5c11 *_poster.jpg \u7684\u89c6\u9891\u62bd\u53d6\u6d77\u62a5\u5e27
 * \u5df2\u5b58\u5728\u7684\u8df3\u8fc7，\u53ef\u91cd\u590d\u6267\u884c。
 */
import fs from 'fs'
import path from 'path'
import { generateImageThumb, thumbPathFor, getAbsolutePath } from '../src/utils/storage.js'
import { extractVideoPoster, posterPathFor } from '../src/utils/video-poster.js'
import { STORAGE_ROOT } from '../src/utils/paths.js'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov'])

function listFiles(subDir: string): string[] {
  const dir = path.join(STORAGE_ROOT, subDir)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile())
}

async function backfillImages(subDir: string) {
  let done = 0, skipped = 0, failed = 0
  for (const file of listFiles(subDir)) {
    const ext = path.extname(file).toLowerCase()
    if (!IMAGE_EXTS.has(ext) || file.endsWith('_thumb.webp')) continue
    const rel = `static/${subDir}/${file}`
    if (fs.existsSync(getAbsolutePath(thumbPathFor(rel)))) { skipped++; continue }
    const ok = await generateImageThumb(rel)
    ok ? done++ : failed++
    if (ok) console.log(`  thumb ✓ ${rel}`)
    else console.warn(`  thumb ✗ ${rel}`)
  }
  console.log(`[${subDir}] \u7f29\u7565\u56fe：\u65b0\u751f\u6210 ${done}，\u5df2\u5b58\u5728 ${skipped}，\u5931\u8d25 ${failed}`)
}

async function backfillVideos(subDir: string) {
  let done = 0, skipped = 0, failed = 0
  for (const file of listFiles(subDir)) {
    const ext = path.extname(file).toLowerCase()
    if (!VIDEO_EXTS.has(ext)) continue
    const rel = `static/${subDir}/${file}`
    if (fs.existsSync(getAbsolutePath(posterPathFor(rel)))) { skipped++; continue }
    const ok = await extractVideoPoster(rel)
    ok ? done++ : failed++
    if (ok) console.log(`  poster ✓ ${rel}`)
    else console.warn(`  poster ✗ ${rel}`)
  }
  console.log(`[${subDir}] \u6d77\u62a5\u5e27：\u65b0\u751f\u6210 ${done}，\u5df2\u5b58\u5728 ${skipped}，\u5931\u8d25 ${failed}`)
}

console.log(`\u56de\u586b\u76ee\u5f55：${STORAGE_ROOT}`)
await backfillImages('images')
await backfillVideos('videos')
await backfillVideos('merged')
console.log('\u56de\u586b\u5b8c\u6210')
