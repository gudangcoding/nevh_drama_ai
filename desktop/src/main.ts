/**
 * Proses utama Electron — Shell Desktop
 *
 * Tanggung jawab: membaca konfigurasi penyimpanan → mengambil port kosong → menyiapkan direktori userData (data + template workspace) →
 * utilityProcess.fork menjalankan backend (esbuild bundle) → memeriksa kesehatan → membuka jendela.
 * Backend dan jendela satu sumber (http://127.0.0.1:<port>), frontend seluruhnya path relatif, tanpa masalah CORS.
 *
 * Backend dapat di-restart (startBackend): migrasi lokasi penyimpanan = stop backend → pindahkan file → ganti currentDataDir →
 * restart backend (lihat migrate.ts); selama backendRestarting menekan dialog "keluar tidak terduga".
 */
import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import * as net from 'net'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import { registerMigrationIpc } from './migrate'
import { registerUpdater, markQuitting } from './updater'

// Proses utama membuat产物 CJS, __dirname tersedia secara alami (import.meta.url di CJS = undefined)
declare const __dirname: string
// desktop/dist → akar desktop
const DESKTOP_ROOT = path.resolve(__dirname, '..')
// Direktori repo dalam mode dev
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..')
const BACKEND_BUNDLE = path.join(DESKTOP_ROOT, 'build', 'backend.mjs')

/** Versi template workspace: ditingkatkan saat template internal diperbarui, memicu penambahan file yang hilang ke direktori pengguna */
const TEMPLATE_VERSION = '4'
const STORAGE_CONFIG_FILE = 'storage-config.json'

let mainWindow: BrowserWindow | null = null
let backend: UtilityProcess | null = null
let quitting = false
let backendRestarting = false
let backendPort = 0
let currentDataDir = ''

// userData dibedakan secara eksplisit berdasarkan mode: versi paket / versi dev tidak saling mengganggu (database, file upload, single instance lock terisolasi),
// tidak bergantung pada nama package.json (setelah打包 nama yang sama dengan dev会导致 single instance lock salah kunci)
app.setPath('userData', path.join(
  app.getPath('appData'),
  app.isPackaged ? 'HuobaoDrama' : 'HuobaoDrama-Dev',
))

if (!app.requestSingleInstanceLock()) {
  // Dua instance akan berebut SQLite write lock; cukup fokuskan jendela yang sudah ada
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  // utilityProcess memerlukan app ready sebelum bisa dibuat
  app.whenReady().then(bootstrap)
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo
      srv.close(() => resolve(addr.port))
    })
    srv.on('error', reject)
  })
}

async function waitHealthy(port: number, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`)
      if (res.ok) return
    } catch (err) {
      lastErr = err
    }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`Backend timeout: ${String(lastErr)}`)
}

// ---- Konfigurasi penyimpanan (userData/storage-config.json, harus di luar direktori data) ----

function storageConfigPath(): string {
  return path.join(app.getPath('userData'), STORAGE_CONFIG_FILE)
}

/**
 * Membaca konfigurasi penyimpanan, mengembalikan direktori data saat ini. Rantai toleransi: file tidak ada → default; parsing gagal/ilegal → warn+default
 * (tidak menimpa file yang rusak, mempertahankan kondisi); pembuatan direktori gagal (disk tidak ada/izin) → warn+default. Tidak pernah memblokir startup.
 */
function loadStorageConfig(): string {
  const fallback = path.join(app.getPath('userData'), 'data')
  const file = storageConfigPath()
  if (!fs.existsSync(file)) return fallback
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const dir = parsed?.dataDir
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('dataDir 非绝对路径')
    fs.mkdirSync(dir, { recursive: true })
    return dir
  } catch (err) {
    console.warn(`[main] ${STORAGE_CONFIG_FILE} 读取失败，回退默认数据目录: ${(err as Error).message}`)
    return fallback
  }
}

/** Penulisan atomik konfigurasi penyimpanan (tmp + rename); hanya dipanggil pada path migrasi berhasil */
export function writeStorageConfig(dataDir: string): void {
  const file = storageConfigPath()
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, dataDir }, null, 2))
  fs.renameSync(tmp, file)
}

/** Perbandingan path win32 di统一 ke huruf kecil */
export function normCase(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p
}

// ---- Template workspace ----

/**
 * Salin template workspace (copy-once + penanda versi):
 * - Target tanpa penanda versi (startup pertama) atau versi lebih lama → hanya tambahkan file yang hilang, tidak pernah menimpa editan pengguna
 * - Versi konsisten → lewati
 * Pengecualian: prompts/ paksa timpa saat upgrade versi — prompt dan kode DEFAULT_PROMPTS dari sumber yang sama
 * (halaman pengaturan punya "reset default", dan skenario edit sedikit); skills/ tetap tambah tanpa timpa (mungkin ada yang dibuat pengguna)
 */
function syncWorkspaceTemplate(templateDir: string, destDir: string) {
  const marker = path.join(destDir, '.template-version')
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === TEMPLATE_VERSION) return
  fs.cpSync(templateDir, destDir, { recursive: true, force: false, errorOnExist: false })
  fs.cpSync(path.join(templateDir, 'prompts'), path.join(destDir, 'prompts'), { recursive: true, force: true })
  fs.writeFileSync(marker, TEMPLATE_VERSION)
}

function resolveResourceDir(): string {
  // 打包后在 resources/（extraResources）；dev 直指仓库目录
  return app.isPackaged ? process.resourcesPath : REPO_ROOT
}

// ---- Proses backend (bisa di-restart) ----

/** Stop backend dan tunggu exit (kill lalu tunggu event exit, 5s timeout paksa kill); set backendRestarting untuk menekan dialog fatal */
function stopBackend(): Promise<void> {
  return new Promise((resolve) => {
    const cur = backend
    if (!cur) return resolve()
    backendRestarting = true
    const timer = setTimeout(() => cur.kill(), 5000)
    cur.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    cur.kill()
  })
}

function startBackend(): void {
  const resources = resolveResourceDir()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(backendPort),
    HUOBAO_DESKTOP: '1',
    // Direktori data sumber tunggal: setelah restart/migrasi cukup ganti currentDataDir
    HUOBAO_DATA_DIR: currentDataDir,
    SQLITE_PATH: path.join(currentDataDir, 'huobao.sqlite3'),
    WORKSPACE_PATH: currentWorkspaceDir,
    FRONTEND_DIST: currentFrontendDist,
  }
  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? '.exe' : ''
    env.FFMPEG_BIN = path.join(resources, 'bin', `ffmpeg${exe}`)
    env.FFPROBE_BIN = path.join(resources, 'bin', `ffprobe${exe}`)
  }

  backend = utilityProcess.fork(BACKEND_BUNDLE, [], {
    env,
    serviceName: 'huobao-backend',
    stdio: 'pipe',
  })
  console.log(`[main] backend forked from ${BACKEND_BUNDLE}`)
  backend.stdout?.on('data', chunk => process.stdout.write(`[backend] ${chunk}`))
  backend.stderr?.on('data', chunk => process.stderr.write(`[backend] ${chunk}`))
  backend.on('exit', code => {
    backend = null
    // Exit selama migrasi/restart adalah perilaku yang diharapkan, dikelola oleh pemanggil
    if (!quitting && !backendRestarting) {
      dialog.showErrorBox('Huobao Drama', `Layanan latar belakang keluar secara tidak terduga (code ${code}), aplikasi akan ditutup. Silakan mulai ulang.`)
      app.quit()
    }
  })
}

// ---- Jendela ----

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Huobao Drama',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  // Judul halaman sudah punya nama produk, hindari judul fallback dari path file
  mainWindow.on('page-title-updated', e => e.preventDefault())
  mainWindow.on('closed', () => { mainWindow = null })
  // Link eksternal selalu diserahkan ke browser sistem: tidak buka jendela baru di dalam aplikasi (misal halaman pengaturan "kunjungi api.firemux.com untuk mendapatkan Kunci")
  const isAppUrl = (url: string) => url.startsWith(`http://127.0.0.1:${backendPort}`)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !isAppUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Jendela utama yang secara tidak sengaja navigasi ke alamat eksternal juga ditangkap dan dialihkan ke browser
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return
    e.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
  return mainWindow.loadURL(`http://127.0.0.1:${backendPort}`)
}

// ---- Startup ----

let currentWorkspaceDir = ''
let currentFrontendDist = ''

async function bootstrap() {
  try {
    backendPort = await getFreePort()
    const userData = app.getPath('userData')
    console.log(`[main] port=${backendPort} userData=${userData}`)

    // Konfigurasi penyimpanan dibaca paling awal (menentukan direktori data); jika konfigurasi rusak, fallback ke default dan tidak memblokir startup
    currentDataDir = loadStorageConfig()
    fs.mkdirSync(currentDataDir, { recursive: true })

    const resources = resolveResourceDir()
    const templateDir = app.isPackaged
      ? path.join(resources, 'workspace-template')
      : path.join(REPO_ROOT, 'backend', 'workspace')
    currentWorkspaceDir = app.isPackaged
      ? path.join(userData, 'workspace')
      : templateDir
    if (app.isPackaged) syncWorkspaceTemplate(templateDir, currentWorkspaceDir)

    currentFrontendDist = app.isPackaged
      ? path.join(resources, 'frontend')
      : path.join(REPO_ROOT, 'frontend', '.output', 'public')

    startBackend()
    await waitHealthy(backendPort)
    console.log('[main] backend sehat, membuka jendela')
    await createWindow()
  } catch (err) {
    console.error('[main] Startup gagal:', err)
    dialog.showErrorBox('Huobao Drama', `Startup gagal:\n${(err as Error)?.message || err}`)
    app.quit()
  }
}

// ---- IPC: Lokasi penyimpanan ----

/** Probe keterbatasan tulis */
async function assertWritable(dir: string): Promise<void> {
  const probe = path.join(dir, `.huobao-probe-${Date.now()}`)
  await fsp.writeFile(probe, 'probe')
  await fsp.rm(probe)
}

ipcMain.handle('huobao:pick-directory', async () => {
  if (!mainWindow) return { ok: false, error: 'Jendela belum siap' }
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih direktori penyimpanan data',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
  const target = path.resolve(res.filePaths[0])

  // Validasi ringan (validasi lengkap dilakukan saat engine migrasi start-migration)
  const a = normCase(path.resolve(currentDataDir))
  const b = normCase(target)
  if (b === a) return { ok: false, error: 'Tidak dapat memilih direktori data saat ini' }
  if (b.startsWith(a + path.sep)) return { ok: false, error: 'Direktori target berada di dalam direktori data saat ini' }
  if (a.startsWith(b + path.sep)) return { ok: false, error: 'Direktori target adalah direktori induk dari direktori data saat ini' }
  try {
    await assertWritable(target)
  } catch {
    return { ok: false, error: 'Direktori target tidak dapat ditulis' }
  }

  let freeBytes: number | null = null
  try {
    const st = await fsp.statfs(target)
    freeBytes = st.bavail * st.bsize
  } catch { /* statfs tidak tersedia, lewati tampilan ruang kosong */ }
  return { ok: true, path: target, freeBytes }
})

// IPC migrasi penyimpanan (validasi/pemindahan/runtutan restart lihat migrate.ts)
const migrationDeps = {
  getWindow: () => mainWindow,
  getDataDir: () => currentDataDir,
  setDataDir: (d: string) => { currentDataDir = d },
  getPort: () => backendPort,
  isBackendAlive: () => backend !== null,
  stopBackend,
  startBackend,
  waitHealthy,
  markRestartingFalse: () => { backendRestarting = false },
  writeConfig: writeStorageConfig,
  configPath: storageConfigPath,
  normCase,
}
registerMigrationIpc(migrationDeps)
registerUpdater(() => mainWindow)

app.on('before-quit', () => {
  quitting = true
  markQuitting()
  backend?.kill()
})

app.on('window-all-closed', () => {
  app.quit()
})
