/**
 * Engine migrasi penyimpanan (proses utama)
 *
 * Runtutan: validate → stop backend → pindah → tulis config → restart backend → done
 * Aturan besi:
 *  - copy divalidasi dulu sebelum menghapus direktori lama (lintas volume: verifikasi byte → hapus; volume sama: rename per entri)
 *  - pemindahan bersifat rollback-selamat: jika satu entri gagal, entri yang sudah dipindah dikembalikan ke lokasi lama
 *  - rename berulang dengan jeda singkat untuk menangani file yang ter-kunci sementara (ffmpeg/antivirus masih memegang handle)
 *  - config baru ditulis setelah file selesai dipindah; kegagalan → restore; jika backend baru tidak sehat → data DIKEMBALIKAN ke lokasi lama + config lama
 *
 * Progress melalui IPC 'huobao:migrate-progress' (throttle 80ms, done/error wajib kirim).
 */
import { app, dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'

export interface MigrationDeps {
  getWindow(): BrowserWindow | null
  getDataDir(): string
  setDataDir(dir: string): void
  getPort(): number
  isBackendAlive(): boolean
  /** Stop backend dan tunggu exit (di dalam mengatur backendRestarting untuk menekan dialog fatal) */
  stopBackend(): Promise<void>
  startBackend(): void
  waitHealthy(port: number, timeoutMs: number): Promise<void>
  /** Lifecycle backend telah selesai (sudah healthy atau sudah pulih) ketika mereset flag */
  markRestartingFalse(): void
  writeConfig(dataDir: string): void
  configPath(): string
  normCase(p: string): string
}

export interface MigrateProgress {
  phase: 'validating' | 'stopping' | 'moving' | 'config' | 'restarting' | 'done' | 'error'
  message?: string
  copiedBytes?: number
  totalBytes?: number
}

export interface MigrateOptions {
  targetDir: string
  migrateFiles: boolean
}

export function registerMigrationIpc(deps: MigrationDeps): void {
  ipcMain.handle('huobao:start-migration', async (_event, opts: MigrateOptions) => {
    try {
      await runMigration(deps, opts)
      return { ok: true }
    } catch (err) {
      // Kembalikan pesan asli ke renderer (jangan biarkan terbungkus pesan techy Electron,
      // agar frontend bisa menampilkan alasan kegagalan yang sebenarnya)
      return { ok: false, error: (err as Error)?.message || 'Migrasi gagal' }
    }
  })
}

// ---- Progress push (throttle 80ms, done/error wajib kirim) ----

function makeReporter(getWindow: () => BrowserWindow | null) {
  let lastSent = 0
  return (progress: MigrateProgress, force = false) => {
    const now = Date.now()
    if (!force && progress.phase !== 'done' && progress.phase !== 'error' && now - lastSent < 80) return
    lastSent = now
    getWindow()?.webContents.send('huobao:migrate-progress', progress)
  }
}

// ---- Validasi ----

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Cek apakah error khas "file ter-kunci" di Windows (rename/hapus bisa ditunda dengan short retry) */
function isLockedError(err: unknown): boolean {
  const code = (err as { code?: string })?.code || ''
  return process.platform === 'win32'
    ? code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
    : code === 'EBUSY' || code === 'EACCES'
}

/** Jalankan operasi file dengan retry pendek untuk menangani kunci handle sementara */
async function retryFile<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown = null
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isLockedError(err)) throw err
    }
    await sleep(600 * (i + 1))
  }
  throw lastErr
}

async function sameVolume(a: string, b: string): Promise<boolean> {
  try {
    const [sa, sb] = await Promise.all([fsp.statfs(a), fsp.statfs(b)])
    return sa.dev === sb.dev
  } catch {
    return false // Jika tidak bisa ditentukan, anggap lintas volume (gunakan copy per file, lebih aman)
  }
}

async function validateTarget(deps: MigrationDeps, target: string, currentDir: string): Promise<number> {
  const targetStat = await fsp.stat(target).catch(() => null)
  if (!targetStat) {
    await fsp.mkdir(target, { recursive: true })
  } else if (!targetStat.isDirectory()) {
    throw new Error('Path target bukan direktori')
  } else {
    const children = await fsp.readdir(target)
    if (children.length > 0) throw new Error('Direktori target harus kosong (pilih folder kosong atau folder baru)')
  }

  // Probe keterbatasan tulis
  await retryFile(async () => {
    const probe = path.join(target, `.huobao-probe-${Date.now()}`)
    await fsp.writeFile(probe, 'probe')
    await fsp.rm(probe)
  })

  // Hubungan path (win32 huruf besar/kecil tidak peka)
  const a = deps.normCase(path.resolve(currentDir))
  const b = deps.normCase(path.resolve(target))
  if (b === a) throw new Error('Tidak dapat memilih direktori data saat ini')
  if (b.startsWith(a + path.sep)) throw new Error('Direktori target berada di dalam direktori data saat ini')
  if (a.startsWith(b + path.sep)) throw new Error('Direktori target adalah direktori induk dari direktori data saat ini')
  const userData = deps.normCase(path.resolve(path.dirname(currentDir))) // <userData>
  if (b === userData) throw new Error('Tidak dapat memilih direktori data aplikasi dan direktori induknya')

  // Total yang akan dipindah (validasi ruang lintas volume + progress migrasi)
  let totalBytes = 0
  const collect = async (dir: string): Promise<void> => {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await collect(full)
      else if (e.isFile()) {
        const st = await fsp.stat(full).catch(() => null)
        if (st) totalBytes += st.size
      }
    }
  }
  await collect(currentDir)

  // Validasi ruang lintas volume (rename volume sama tidak memakan ruang tambahan, lewati)
  if (!(await sameVolume(currentDir, target))) {
    const st = await fsp.statfs(target)
    const free = st.bavail * st.bsize
    if (free < totalBytes * 1.05) {
      const needGb = ((totalBytes * 1.05) / 1024 ** 3).toFixed(1)
      const freeGb = (free / 1024 ** 3).toFixed(1)
      throw new Error(`Ruang disk target tidak cukup: perlu sekitar ${needGb} GB, tersisa ${freeGb} GB`)
    }
  }
  return totalBytes
}

// ---- Pemindahan ----

async function collectFileList(dir: string, base = dir, out: FileEntry[] = []): Promise<FileEntry[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) await collectFileList(full, base, out)
    else if (e.isFile()) {
      const st = await fsp.stat(full)
      out.push({ rel: path.relative(base, full), size: st.size })
    }
  }
  return out
}

interface FileEntry {
  rel: string
  size: number
}

const ignore = async () => undefined

/** Kembalikan entri yang sudah dipindah (volume sama) kembali ke direktori lama saat terjadi kegagalan */
async function rollbackRenamed(moved: string[], oldDir: string, newDir: string): Promise<void> {
  for (const name of [...moved].reverse()) {
    await fsp.rename(path.join(newDir, name), path.join(oldDir, name)).catch(ignore)
  }
}

/** Bersihkan isi direktori target yang masih tersisa setelah kegagalan copy (tidak menyentuh direktori lama) */
async function cleanupPartialTarget(target: string): Promise<void> {
  await fsp.rm(target, { recursive: true, force: true }).catch(ignore)
}

/**
 * Pindahkan isi direktori data.
 * Aturan besi: tidak hapus direktori lama sebelum seluruh pemindahan berhasil DIVERIFIKASI.
 *  - Volume sama: rename per entri top-level; saat gagal → entri yang sudah dipindah dikembalikan (rollback)
 *  - Lintas volume: copy berdasarkan manifest (dengan retry) + verifikasi byte → baru hapus lama
 */
async function moveData(
  oldDir: string,
  newDir: string,
  report: (p: MigrateProgress, force?: boolean) => void,
): Promise<void> {
  await retryFile(async () => fsp.mkdir(newDir, { recursive: true }))
  const topEntries = await fsp.readdir(oldDir, { withFileTypes: true })

  if (await sameVolume(oldDir, newDir)) {
    const moved: string[] = []
    for (const e of topEntries) {
      const src = path.join(oldDir, e.name)
      const dst = path.join(newDir, e.name)
      try {
        await retryFile(async () => fs.renameSync(src, dst))
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code === 'EXDEV') { break }
        // Rollback entri yang sudah dipindah, lalu teruskan error asli
        await rollbackRenamed(moved, oldDir, newDir)
        throw err
      }
      moved.push(e.name)
    }
    // Jika salah satu entri ternyata lintas volume (EXDEV): turunkan seluruhnya ke copy lintas volume (aman, tidak hapus sebelum verifikasi)
    if (moved.length < topEntries.length) {
      await rollbackRenamed(moved, oldDir, newDir)
      await copyAcrossTop(topEntries, oldDir, newDir, report)
      return
    }
    await fsp.rm(oldDir, { recursive: true, force: true }).catch(ignore)
    return
  }

  // Lintas volume: daftar lengkap → copy per file (retry) → verifikasi byte → hapus lama
  const files = await collectFileList(oldDir)
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  let copied = 0
  try {
    for (const f of files) {
      const dst = path.join(newDir, f.rel)
      await retryFile(async () => fsp.mkdir(path.dirname(dst), { recursive: true }))
      await retryFile(async () => {
        await fsp.copyFile(path.join(oldDir, f.rel), dst)
      })
      copied += f.size
      report({ phase: 'moving', copiedBytes: copied, totalBytes })
    }
    // Verifikasi byte
    const copiedFiles = await collectFileList(newDir)
    const copiedTotal = copiedFiles.reduce((s, f) => s + f.size, 0)
    if (copiedFiles.length !== files.length || copiedTotal !== totalBytes) {
      throw new Error(`Verifikasi migrasi gagal: jumlah file ${copiedFiles.length}/${files.length}, byte ${copiedTotal}/${totalBytes}`)
    }
  } catch (err) {
    await cleanupPartialTarget(newDir)
    throw err
  }
  await fsp.rm(oldDir, { recursive: true, force: true }).catch(ignore)
}

/** Copy lintas volume untuk seluruh entri top-level (fallback setelah EXDEV saat mode volume sama) */
async function copyAcrossTop(
  topEntries: fs.Dirent[],
  oldDir: string,
  newDir: string,
  report: (p: MigrateProgress, force?: boolean) => void,
): Promise<void> {
  const files = await collectFileList(oldDir)
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  let copied = 0
  try {
    for (const f of files) {
      const dst = path.join(newDir, f.rel)
      await retryFile(async () => fsp.mkdir(path.dirname(dst), { recursive: true }))
      await retryFile(async () => fsp.copyFile(path.join(oldDir, f.rel), dst))
      copied += f.size
      report({ phase: 'moving', copiedBytes: copied, totalBytes })
    }
    const copiedFiles = await collectFileList(newDir)
    const copiedTotal = copiedFiles.reduce((s, f) => s + f.size, 0)
    if (copiedFiles.length !== files.length || copiedTotal !== totalBytes) {
      throw new Error('Verifikasi migrasi gagal')
    }
  } catch (err) {
    await cleanupPartialTarget(newDir)
    throw err
  }
  await fsp.rm(oldDir, { recursive: true, force: true }).catch(ignore)
}

// ---- Alur utama ----

/** Ubah error teknis pemindahan menjadi pesan yang mudah dipahami pengguna */
function friendlyMigrationError(err: unknown): string {
  const msg = (err as Error)?.message || String(err)
  if (/EBUSY|EACCES|EPERM|resource busy|another process|already running|being used|sharing violation|in use/i.test(msg)) {
    return 'Gagal memindahkan data: ada file yang masih digunakan oleh aplikasi lain (contohnya proses latar penggabungan video atau antivirus). Selesaikan produksi yang sedang berjalan, lalu coba lagi.'
  }
  if (/ENOENT|no such file/i.test(msg)) {
    return 'Gagal memindahkan data: ada file/data yang tidak ditemukan. Periksa kembali direktori data.'
  }
  return msg
}

export async function runMigration(deps: MigrationDeps, opts: MigrateOptions): Promise<void> {
  const report = makeReporter(deps.getWindow)
  const oldDir = path.resolve(deps.getDataDir())
  const target = path.resolve(opts.targetDir)
  const backendWasAlive = deps.isBackendAlive()

  // state jejak pemulihan: apakah data sudah dipindah / config baru sudah ditulis
  try {
    report({ phase: 'validating' }, true)
    const totalBytes = await validateTarget(deps, target, oldDir)

    if (backendWasAlive) {
      report({ phase: 'stopping' }, true)
      await deps.stopBackend()
    }

    if (opts.migrateFiles) {
      report({ phase: 'moving', copiedBytes: 0, totalBytes }, true)
      await moveData(oldDir, target, report)
    } else {
      await retryFile(async () => fsp.mkdir(target, { recursive: true }))
    }

    // Config baru ditulis setelah file selesai dipindah; jika penulisan gagal → restore nilai lama
    report({ phase: 'config' }, true)
    const configExisted = fs.existsSync(deps.configPath())
    const oldConfigRaw = configExisted ? fs.readFileSync(deps.configPath(), 'utf8') : null
    try {
      deps.writeConfig(target)
    } catch (err) {
      if (oldConfigRaw !== null) {
        try { fs.writeFileSync(deps.configPath(), oldConfigRaw) } catch { /* abaikan */ }
      } else {
        fs.rmSync(deps.configPath(), { force: true })
      }
      throw err
    }

    report({ phase: 'restarting' }, true)
    deps.setDataDir(target)
    deps.startBackend()
    try {
      await deps.waitHealthy(deps.getPort(), 20_000)
    } catch (err) {
      // Backend baru tidak sehat setelah perpindahan: KEMBALIKAN data + config ke lokasi lama,
      // lalu hidupkan ulang di lokasi lama. Jangan biarkan requestConfig/data tertinggal di lokasi baru.
      await restoreToOldDir(deps, oldDir, target, report)
      deps.setDataDir(oldDir)
      deps.startBackend()
      await deps.waitHealthy(deps.getPort(), 20_000)
      deps.markRestartingFalse()
      throw err
    }
    deps.markRestartingFalse()
    report({ phase: 'done' }, true)
  } catch (err) {
    const message = friendlyMigrationError(err)
    report({ phase: 'error', message }, true)

    // Pemulihan umum: backend seharusnya dalam kondisi berjalan; jika pemulihan gagal, dialog + keluar
    const tryRestoreBackend = async (): Promise<void> => {
      if (!deps.isBackendAlive()) {
        deps.setDataDir(oldDir)
        deps.startBackend()
        await deps.waitHealthy(deps.getPort(), 20_000)
        deps.markRestartingFalse()
      } else {
        deps.markRestartingFalse()
      }
    }
    try {
      await tryRestoreBackend()
    } catch (recoverErr) {
      console.error('[migrate] Pemulihan backend gagal:', recoverErr)
      dialog.showErrorBox('Nevh Drama', `Migrasi penyimpanan gagal dan pemulihan layanan latar belakang gagal, aplikasi akan ditutup.\nError asli: ${message}`)
      app.quit()
      return
    }
    throw new Error(message)
  }
}

/**
 * Data + config sudah dipindah ke target namun backend baru tidak sehat:
 * stop backend → pindahkan balik target → oldDir → tulis config lama → restore.
 */
async function restoreToOldDir(
  deps: MigrationDeps,
  oldDir: string,
  target: string,
  report: (p: MigrateProgress, force?: boolean) => void,
): Promise<void> {
  await deps.stopBackend()
  if (fs.existsSync(target)) {
    await fsp.mkdir(oldDir, { recursive: true })
    await moveData(target, oldDir, report)
  }
  deps.writeConfig(oldDir)
}