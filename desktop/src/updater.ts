/**
 * Pembaruan dalam aplikasi (tanpa skema tanda tangan Apple, konsep serupa Tauri updater)
 *
 * - Manifes: HUOBAO_UPDATE_FEED (default GitHub Releases releases/latest/download/latest.json)
 * - macOS: unduh zip (arsip .app) → verifikasi sha256 → ekstrak → rename paket lama .old sebagai cadangan → paket baru di tempat
 *   → `open` menjalankan aplikasi baru →实例 saat ini keluar; startup berikutnya bersihkan .old
 * - Windows: unduh Setup.exe → verifikasi sha256 → instalasi senyap detached (/S) →实例 saat ini keluar
 * - Mode belum打包 (dev) dinonaktifkan secara keseluruhan
 */
import { app, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import crypto from 'crypto'
import { spawn, execFile } from 'child_process'

const FEED_URL = process.env.HUOBAO_UPDATE_FEED
  || 'https://github.com/chatfire-AI/huobao-drama/releases/latest/download/latest.json'

export interface UpdateState {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  latestVersion?: string
  notes?: string
  error?: string
  downloadProgress?: number
  downloadedFile?: string
}

let state: UpdateState = { status: 'idle', currentVersion: '' }
let mainWindow: () => BrowserWindow | null

function sendProgress(percent: number) {
  state.downloadProgress = percent
  mainWindow()?.webContents.send('huobao:update-progress', percent)
}

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch }
}

// ---- Utilitas ----

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

async function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

/** Kunci arsitektur saat ini (konsisten dengan kunci platforms di latest.json) */
function platformKey(): string {
  return `${process.platform}-${process.arch}`
}

/** Path .app dari app yang terinstal (hanya macOS, dalam kondisi打包) */
function installedAppBundle(): string {
  // process.execPath = .../HuobaoDrama.app/Contents/MacOS/HuobaoDrama
  return path.resolve(path.dirname(process.execPath), '..', '..')
}

async function fetchFeed(): Promise<{ version: string, notes?: string, platforms: Record<string, { url: string, sha256: string, size?: number }> }> {
  const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Permintaan daftar versi gagal (HTTP ${res.status})`)
  const feed = await res.json()
  if (!feed?.version || !feed?.platforms) throw new Error('Format daftar versi tidak benar')
  return feed
}

// ---- Pemeriksaan ----

async function doCheck(): Promise<UpdateState> {
  if (!app.isPackaged) {
    setState({ status: 'error', error: 'Mode pengembangan tidak mendukung pembaruan' })
    return state
  }
  setState({ status: 'checking', error: undefined })
  try {
    const feed = await fetchFeed()
    const latestVersion = feed.version.replace(/^v/, '')
    setState({
      status: compareVersions(latestVersion, app.getVersion()) > 0 ? 'available' : 'up-to-date',
      latestVersion,
      notes: feed.notes,
      error: undefined,
    })
  } catch (err) {
    setState({ status: 'error', error: (err as Error).message })
  }
  return state
}

// ---- Unduh ----

async function doDownload(): Promise<UpdateState> {
  if (state.status !== 'available' && state.status !== 'downloaded') {
    throw new Error('Tidak ada pembaruan yang dapat diunduh saat ini')
  }
  const feed = await fetchFeed()
  const asset = feed.platforms[platformKey()]
  if (!asset) throw new Error(`Paket pembaruan untuk platform ${platformKey()} belum tersedia`)

  setState({ status: 'downloading', downloadProgress: 0 })
  // Unduh file besar tanpa timeout keseluruhan (progress digerakkan oleh stream); gangguan jaringan akan memicu异常 fetch
  const res = await fetch(asset.url)
  if (!res.ok || !res.body) throw new Error(`Unduhan paket pembaruan gagal (HTTP ${res.status})`)

  const total = asset.size || Number(res.headers.get('content-length')) || 0
  const dir = path.join(app.getPath('temp'), 'huobao-update')
  await fsp.mkdir(dir, { recursive: true })
  const fileName = decodeURIComponent(asset.url.split('/').pop() || `update-${Date.now()}`)
  const dest = path.join(dir, fileName)

  let received = 0
  let lastReport = 0
  const out = fs.createWriteStream(dest)
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (!out.write(Buffer.from(value))) {
      await new Promise<void>(r => out.once('drain', r))
    }
    const now = Date.now()
    if (total && now - lastReport > 200) {
      lastReport = now
      sendProgress(Math.min(99, Math.round((received / total) * 100)))
    }
  }
  out.end()
  await new Promise<void>((resolve, reject) => {
    out.on('finish', resolve)
    out.on('error', reject)
  })

  // Verifikasi integritas
  const actual = await sha256(dest)
  if (asset.sha256 && actual !== asset.sha256) {
    await fsp.rm(dest, { force: true })
    throw new Error('Verifikasi paket pembaruan gagal (sha256 tidak cocok), instalasi dibatalkan')
  }

  setState({ status: 'downloaded', downloadProgress: 100, downloadedFile: dest })
  sendProgress(100)
  return state
}

// ---- Instalasi (setelah berhasil,实例 saat ini keluar, tidak akan mengembalikan) ----

async function doApply(): Promise<void> {
  if (state.status !== 'downloaded' || !state.downloadedFile) {
    // Fallback: langsung periksa hasil terbaru di temp
    throw new Error('Silakan unduh pembaruan terlebih dahulu')
  }
  const downloaded = state.downloadedFile

  if (process.platform === 'darwin') {
    const bundle = installedAppBundle()
    const tmpExtract = path.join(app.getPath('temp'), `huobao-update-extract-${Date.now()}`)
    await new Promise<void>((resolve, reject) => {
      execFile('unzip', ['-q', '-o', downloaded, '-d', tmpExtract], err => (err ? reject(err) : resolve()))
    })
    const newApp = path.join(tmpExtract, 'HuobaoDrama.app')
    if (!fs.existsSync(newApp)) throw new Error('Isi paket pembaruan tidak normal (HuobaoDrama.app tidak ditemukan)')

    const oldBundle = `${bundle}.old`
    fs.rmSync(oldBundle, { recursive: true, force: true })
    fs.renameSync(bundle, oldBundle)
    try {
      fs.renameSync(newApp, bundle)
    } catch (err) {
      // Penempatan gagal: rollback paket lama
      fs.renameSync(oldBundle, bundle)
      throw err
    } finally {
      fs.rmSync(tmpExtract, { recursive: true, force: true })
    }
    // Detached menjalankan aplikasi baru lalu实例 saat ini keluar; startup berikutnya bersihkan .old cadangan
    spawn('open', [bundle], { detached: true, stdio: 'ignore' }).unref()
    app.quit()
    return
  }

  if (process.platform === 'win32') {
    // NSIS 静默安装：detached 拉起安装器后退出当前实例
    spawn(downloaded, ['/S'], { detached: true, stdio: 'ignore' }).unref()
    app.quit()
    return
  }

  throw new Error(`Platform tidak didukung: ${process.platform}`)
}

// ---- Pendaftaran ----

export function registerUpdater(getWindow: () => BrowserWindow | null): void {
  mainWindow = getWindow
  state.currentVersion = app.getVersion()

  ipcMain.handle('huobao:update-state', () => state)
  ipcMain.handle('huobao:update-check', () => doCheck())
  ipcMain.handle('huobao:update-download', async () => {
    try {
      return await doDownload()
    } catch (err) {
      setState({ status: 'error', error: (err as Error).message })
      throw err
    }
  })
  ipcMain.handle('huobao:update-apply', () => doApply())

  // Setelah startup, periksa secara senyap sekali (saat versi baru ditemukan, layer render melalui update-state polling/toast notifikasi)
  setTimeout(() => { if (!quittingApp()) void doCheck() }, 20_000).unref?.()

  // Bersihkan cadangan paket lama dari pembaruan sebelumnya. Tunda 3s: saat startup pertama setelah pembaruan,实例 lama mungkin masih dalam proses keluar,
  // menghapus segera mungkin bersaing dengan penulisan akhir; kegagalan tidak memblokir (startup berikutnya akan mencoba lagi)
  if (app.isPackaged && process.platform === 'darwin') {
    setTimeout(() => {
      const oldBundle = `${installedAppBundle()}.old`
      try {
        if (fs.existsSync(oldBundle)) fs.rmSync(oldBundle, { recursive: true, force: true })
      } catch { /* Sisa biarkan startup berikutnya mencoba lagi */ }
    }, 3000).unref?.()
  }
}

function quittingApp(): boolean {
  // Updater tidak memiliki status quitting sendiri, hindari dependensi sirkuler: main mengatur global injection
  return (globalThis as { __huobaoQuitting?: boolean }).__huobaoQuitting === true
}

/** Dipanggil oleh main.ts pada before-quit */
export function markQuitting(): void {
  ;(globalThis as { __huobaoQuitting?: boolean }).__huobaoQuitting = true
}
