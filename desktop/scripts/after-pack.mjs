/**
 * electron-builder afterPack hook — fixes the better-sqlite3 native module in Windows packages.
 *
 * Background: dist:win cross-builds on macOS, and @electron/rebuild/prebuild-install downloads
 * prebuilt artifacts for the host platform, so build/Release/better_sqlite3.node in the win package
 * ends up being Mach-O (a macOS binary). dlopen then fails on Windows and the backend exits with code 1.
 *
 * Fix: after packaging (win-unpacked created, before NSIS wrapping), overwrite it with the official
 * win32-x64 prebuilt .node. The prebuilt file is cached at build/win-bin/better_sqlite3.node
 * (same caching approach as ffmpeg.exe; re-download the matching ABI when better-sqlite3 or
 * the Electron major version changes: https://github.com/WiseLibs/better-sqlite3/releases)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WIN_BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'win-bin', 'better_sqlite3.node')

export default async function afterPack(context) {
  // electron-builder only warns, but does not fail, on missing extraResources (this once shipped
  // a package without ffmpeg), so enforce it here: every platform must include its own ffmpeg/ffprobe
  const resourcesDir = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  const exe = context.electronPlatformName === 'win32' ? '.exe' : ''
  for (const name of [`ffmpeg${exe}`, `ffprobe${exe}`]) {
    const p = path.join(resourcesDir, 'bin', name)
    if (!fs.existsSync(p)) throw new Error(`Package is missing bin/${name} (check prepare-resources and \${os} directory naming)`)
  }

  if (context.electronPlatformName !== 'win32') return
  if (!fs.existsSync(WIN_BIN)) {
    throw new Error(
      `Missing win32 better-sqlite3 prebuilt binary: ${WIN_BIN}\n` +
      'Download https://github.com/WiseLibs/better-sqlite3/releases/download/v12.11.1/' +
      'better-sqlite3-v12.11.1-electron-v136-win32-x64.tar.gz, extract build/Release/better_sqlite3.node and place it at that path',
    )
  }
  const target = path.join(
    context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules',
    'better-sqlite3', 'build', 'Release', 'better_sqlite3.node',
  )
  if (!fs.existsSync(target)) throw new Error(`better_sqlite3.node to replace not found: ${target}`)
  fs.copyFileSync(WIN_BIN, target)
  // Also remove leftover prebuilt binaries for the host platform (bindings never use them, but they waste space)
  fs.rmSync(path.join(path.dirname(path.dirname(path.dirname(target))), 'bin'), { recursive: true, force: true })
  console.log(`[after-pack] win32 better_sqlite3.node replaced with a PE binary (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)}MB)`)
}
