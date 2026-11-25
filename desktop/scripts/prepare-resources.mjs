/**
 * Package resource preparation — assembles desktop/resources/ (the source for electron-builder extraResources).
 *
 * 1. frontend/           <- nuxt generate output (.output/public, with index.html)
 * 2. workspace-template/ <- backend/workspace (skills + prompts, copied into userData on first launch)
 * 3. bin-<os>/           <- ffmpeg/ffprobe split by platform (the electron-builder ${os} macro picks one,
 *                           so mac packages don't carry exe files and win packages don't waste +144MB on mac binaries)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP = path.resolve(__dirname, '..')
const REPO = path.resolve(DESKTOP, '..')
const RES = path.join(DESKTOP, 'resources')

fs.rmSync(RES, { recursive: true, force: true })
fs.mkdirSync(RES, { recursive: true })

// 1. Static frontend output
const frontendSrc = path.join(REPO, 'frontend', '.output', 'public')
if (!fs.existsSync(path.join(frontendSrc, 'index.html'))) {
  console.error('Frontend output missing: run npm run generate in frontend/ first')
  process.exit(1)
}
fs.cpSync(frontendSrc, path.join(RES, 'frontend'), { recursive: true })
console.log('resources/frontend ✓')

// 2. Workspace template (skills + prompts)
const workspaceSrc = path.join(REPO, 'backend', 'workspace')
fs.cpSync(workspaceSrc, path.join(RES, 'workspace-template'), { recursive: true })
console.log('resources/workspace-template ✓')

// 3. ffmpeg binaries (macOS/Linux use the current-platform artifacts from ffmpeg-static;
//    Windows cross-build: ffmpeg.exe is fetched from the ffmpeg-static GitHub release (cached locally),
//    while ffprobe.exe comes from the win32/x64 artifact bundled with ffprobe-static)
const req = createRequire(import.meta.url)
const binMac = path.join(RES, 'bin-mac')
const binWin = path.join(RES, 'bin-win')
fs.mkdirSync(binMac, { recursive: true })
fs.mkdirSync(binWin, { recursive: true })
const ffmpegPath = req('ffmpeg-static')
const ffprobePath = req('ffprobe-static')?.path
if (!ffmpegPath || !ffprobePath || !fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
  console.error('ffmpeg-static/ffprobe-static binaries missing; re-run npm install (or configure a FFMPEG_BINARIES_URL mirror)')
  process.exit(1)
}
fs.copyFileSync(ffmpegPath, path.join(binMac, 'ffmpeg'))
fs.copyFileSync(ffprobePath, path.join(binMac, 'ffprobe'))
fs.chmodSync(path.join(binMac, 'ffmpeg'), 0o755)
fs.chmodSync(path.join(binMac, 'ffprobe'), 0o755)
console.log('resources/bin-mac ✓')

// 3b. Windows binaries (used for win packages; if absent and no win build is requested, only warn)
const winBinDir = path.join(DESKTOP, 'build', 'win-bin')
const ffmpegWin = path.join(winBinDir, 'ffmpeg.exe')
const ffprobeWinSrc = path.join(path.dirname(req.resolve('ffprobe-static/package.json')), 'bin', 'win32', 'x64', 'ffprobe.exe')
if (!fs.existsSync(ffmpegWin)) {
  console.warn('Note: build/win-bin/ffmpeg.exe is missing, so the Windows package will not bundle ffmpeg. ' +
    'Get it from: https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-win32-x64')
}
if (fs.existsSync(ffmpegWin) && fs.existsSync(ffprobeWinSrc)) {
  fs.copyFileSync(ffmpegWin, path.join(binWin, 'ffmpeg.exe'))
  fs.copyFileSync(ffprobeWinSrc, path.join(binWin, 'ffprobe.exe'))
  console.log('resources/bin-win ✓')
}
