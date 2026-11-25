/**
 * Generate latest.json, the version manifest used by the in-app updater.
 *
 * Usage: after `npm run dist` / `npm run dist:win`, run `node scripts/make-update-feed.mjs`
 *   --base-url <url>  Download base URL; defaults to the direct GitHub Releases link
 *                     (https://github.com/<owner>/<repo>/releases/download/v<version>)
 *   --notes "text"    Release notes for this update
 *
 * Output release/latest.json structure:
 * { version, notes, platforms: { "<platform>-<arch>": { url, sha256, size } } }
 *
 * Publishing: upload latest.json together with the installers to a GitHub Release (tag like v1.0.1);
 * the updater fetches releases/latest/download/latest.json by default, which completes the rollout.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP = path.resolve(__dirname, '..')
const RELEASE = path.join(DESKTOP, 'release')

const argv = process.argv.slice(2)
function argOf(flag) {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'))
const version = pkg.version
const repo = process.env.GITHUB_REPO || 'gudangcoding/nevh_drama_ai'
const baseUrl = argOf('--base-url')
  || process.env.UPDATE_BASE_URL
  || `https://github.com/${repo}/releases/download/v${version}`
const notes = argOf('--notes') || ''

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

// Platform keys (matching updater process.platform-process.arch) -> artifact file names
// (electron-builder adds a -mac suffix to mac zip names)
const targets = [
  { key: 'darwin-arm64', file: `Nevh Drama-${version}-arm64-mac.zip` },
  { key: 'darwin-x64', file: `Nevh Drama-${version}-mac.zip` },
  { key: 'win32-x64', file: `Nevh Drama Setup ${version}.exe` },
]

const platforms = {}
const missing = []
for (const t of targets) {
  const file = path.join(RELEASE, t.file)
  if (!fs.existsSync(file)) {
    missing.push(t.file)
    continue
  }
  platforms[t.key] = {
    // GitHub normalizes spaces in asset names to dots (both gh CLI and API do this; spaces cannot be kept),
    // so URLs must use the server's actual asset name or downloads return 404
    url: `${baseUrl}/${encodeURIComponent(t.file.replace(/ /g, '.'))}`,
    sha256: await sha256(file),
    size: fs.statSync(file).size,
  }
}

if (missing.length === targets.length) {
  console.error('No update artifacts found under release/; run npm run dist / dist:win first')
  process.exit(1)
}

const feed = { version, notes, platforms }
const out = path.join(RELEASE, 'latest.json')
fs.writeFileSync(out, JSON.stringify(feed, null, 2))
console.log(`latest.json ✓ (${Object.keys(platforms).length} platforms)`)
if (missing.length) console.warn(`Missing artifacts (not included in the manifest): ${missing.join(', ')}`)
console.log(out)
