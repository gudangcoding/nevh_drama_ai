import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('extraction service runs per-target async tasks', () => {
  const svc = read('src/services/extraction.ts')

  // \u4e09\u7c7b\u8d44\u4ea7\u76ee\u6807
  assert.match(svc, /'characters' \| 'scenes' \| 'props'/)
  assert.match(svc, /EXTRACT_TARGETS.*characters.*scenes.*props/s)
  // \u6309 \u96c6×\u7c7b\u578b \u952e\u63a7\u7684\u5185\u5b58\u4efb\u52a1\u8868
  assert.match(svc, /`\$\{episodeId\}:\$\{target\}`/)
  assert.match(svc, /status: 'running' \| 'done' \| 'error'/)
  // \u540c\u96c6\u540c\u7c7b\u578b\u8fd0\u884c\u4e2d\u4e0d\u91cd\u590d\u542f\u52a8
  assert.match(svc, /tasks\.get\(key\)\?\.status === 'running'\)\s*return false/)
  // \u6bcf\u7c7b\u8d44\u4ea7\u9650\u5b9a\u53ea\u63d0\u53d6\u8be5\u7c7b\u578b
  assert.match(svc, /\u672c\u6b21\u53ea\u63d0\u53d6\u89d2\u8272/)
  assert.match(svc, /\u672c\u6b21\u53ea\u63d0\u53d6\u573a\u666f/)
  assert.match(svc, /\u672c\u6b21\u53ea\u63d0\u53d6\u9053\u5177/)
  // fire-and-forget \u5f02\u6b65\u6267\u884c extractor Agent
  assert.match(svc, /mastra\.getAgent\('extractor'\)/)
  assert.match(svc, /\.then\(\(result[^)]*\) => \{[\s\S]*status = 'done'/)
  assert.match(svc, /\.catch\(\(err/)
  // \u9010\u6b65\u6253\u5370 Agent \u8fdb\u5c55（\u5de5\u5177\u8c03\u7528 + \u6587\u672c），\u5b8c\u6210\u65f6\u6253\u5370\u6c47\u603b
  assert.match(svc, /onStepFinish/)
  assert.match(svc, /-step/)
  assert.match(svc, /toolCalls/)
})

test('extraction tools dedupe by normalized name so near-names reuse existing assets', () => {
  const tools = read('src/agents/tools/extract-tools.ts')

  // \u5f52\u4e00\u5316：\u62ec\u53f7\u5b9a\u4f4d/\u522b\u540d\u540e\u7f00\u53bb\u9664 + \u7a7a\u767d/\u5927\u5c0f\u5199\u7edf\u4e00
  assert.match(tools, /normalizeName\(name: string\)/)
  assert.match(tools, /replace\(\/\[（\(]/) // \u4e2d/\u82f1\u6587\u62ec\u53f7\u5b57\u7b26\u7c7b
  assert.match(tools, /replace\(\/\[\\s/) // \u7a7a\u767d\u5b57\u7b26\u7c7b
  assert.match(tools, /\.toLowerCase\(\)/)
  // \u89d2\u8272\u4fdd\u5b58：\u7cbe\u786e\u5339\u914d\u4f18\u5148，\u5f52\u4e00\u5316\u8fd1\u540d\u515c\u5e95，\u547d\u4e2d\u5373\u590d\u7528\u4e0d\u91cd\u590d\u521b\u5efa
  assert.match(tools, /normalizeName\(c\.name\) === normName/)
  assert.match(tools, /matchedViaNorm/)
  assert.match(tools, /save-characters-reuse/)
  // \u9053\u5177\u540c\u6837\u6309\u5f52\u4e00\u5316\u540d\u5b57\u590d\u7528
  assert.match(tools, /normalizeName\(p\.name\) === normName/)
  assert.match(tools, /save-props-reuse/)
  // \u573a\u666f\u6309 \u5730\u70b9+\u65f6\u95f4 \u5339\u914d，\u5730\u70b9\u4ec5\u505a\u7a7a\u767d/\u5927\u5c0f\u5199\u5f52\u4e00\u5316（\u4e0d\u5220\u62ec\u53f7）
  assert.match(tools, /normalizeLocation\(loc: string\)/)
  assert.match(tools, /normalizeLocation\(s\.location\) === normLocation/)
  // read_existing_* \u8fd4\u56de\u5f52\u4e00\u5316\u5b57\u6bb5\u4f9b Agent \u5224\u65ad\u590d\u7528
  assert.match(tools, /normalized_name: normalizeName/)
  assert.match(tools, /normalized_location: normalizeLocation/)
})

test('episodes route exposes async extract endpoints', () => {
  const route = read('src/routes/episodes.ts')

  assert.match(route, /app\.post\('\/:id\/extract'/)
  assert.match(route, /app\.get\('\/:id\/extract-status'/)
  assert.match(route, /target harus characters \/ scenes \/ props/)
  assert.match(route, /startExtraction\(ep\.id, ep\.dramaId, target, \{ model: body\.model/)
  // \u9876\u680f\u6587\u672c\u6a21\u578b\u8986\u76d6\u900f\u4f20\u5230\u63d0\u53d6 Agent
  assert.match(read('src/services/extraction.ts'), /modelOverride: opts\.model/)
  assert.match(route, /getExtractionStatus\(id\)/)
})
