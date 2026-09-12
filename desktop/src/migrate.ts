/**
 * Engine migrasi penyimpanan (proses utama)
 *
 * Runtutan: validate → stop backend → pindah → tulis config → restart backend → done
 * Aturan besi: copy harus validasi dulu sebelum hapus direktori lama; config baru ditulis setelah file selesai dipindah; setiap kegagalan rollback dan jalankan backend dengan direktori lama.
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
  /** Lifecycle backend telah selesai (sudah healthy atau sudah pulih) whena mereset flag */
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
    await runMigration(deps, opts)
    return { ok: true }
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
    if (children.length > 0) throw new Error('Direktori target harus kosong')
  }

  // Probe keterbatasan tulis
  const probe = path.join(target, `.huobao-probe-${Date.now()}`)
  await fsp.writeFile(probe, 'probe')
  await fsp.rm(probe)

  // Hubungan path (win32 huruf besar/kecil tidak peka)
  const a = deps.normCase(path.resolve(currentDir))
  const b = deps.normCase(path.resolve(target))
  if (b === a) throw new Error('Tidak dapat memilih direktori data saat ini')
  if (b.startsWith(a + path.sep)) throw new Error('Direktori target berada di dalam direktori data saat ini')
  if (a.startsWith(b + path.sep)) throw new Error('Direktori target adalah direktori induk dari direktori data saat ini')
  const userData = deps.normCase(path.resolve(path.dirname(currentDir))) // <userData>
  if (b === userData || a.startsWith(b + path.sep)) throw new Error('Tidak dapat memilih direktori data aplikasi dan direktori induknya')

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

/**
 * Pindahkan isi direktori data. Aturan besi: tidak hapus direktori lama sebelum verifikasi copy berhasil.
 * Volume sama: rename per entri top-level (EXDEV fallback ke copy lintas volume); lintas volume: copy berdasarkan manifest + verifikasi byte + hapus lama.
 */
async function moveData(
  oldDir: string,
  newDir: string,
  report: (p: MigrateProgress, force?: boolean) => void,
): Promise<void> {
  await fsp.mkdir(newDir, { recursive: true })
  const topEntries = await fsp.readdir(oldDir, { withFileTypes: true })

  if (await sameVolume(oldDir, newDir)) {
    for (const e of topEntries) {
      const src = path.join(oldDir, e.name)
      const dst = path.join(newDir, e.name)
      try {
        fs.renameSync(src, dst)
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code === 'EXDEV') {
          await copyAcross([src], oldDir, newDir, report)
        } else throw err
      }
    }
    await fsp.rm(oldDir, { recursive: true, force: true })
    return
  }

  // Lintas volume: daftar lengkap → copy per file → verifikasi byte → hapus lama
  const files = await collectFileList(oldDir)
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  let copied = 0
  for (const f of files) {
    const dst = path.join(newDir, f.rel)
    await fsp.mkdir(path.dirname(dst), { recursive: true })
    await fsp.copyFile(path.join(oldDir, f.rel), dst)
    copied += f.size
    report({ phase: 'moving', copiedBytes: copied, totalBytes })
  }
  // Verifikasi byte
  const copiedFiles = await collectFileList(newDir)
  const copiedTotal = copiedFiles.reduce((s, f) => s + f.size, 0)
  if (copiedFiles.length !== files.length || copiedTotal !== totalBytes) {
    throw new Error(`Verifikasi migrasi gagal: jumlah file ${copiedFiles.length}/${files.length}, byte ${copiedTotal}/${totalBytes}`)
  }
  await fsp.rm(oldDir, { recursive: true, force: true })
}

/** Saat rename menghadapi EXDEV, entri top-level tertentu diturunkan ke copy lintas volume (jarang, progress sederhana) */
async function copyAcross(sources: string[], oldDir: string, newDir: string, report: (p: MigrateProgress, force?: boolean) => void): Promise<void> {
  let total = 0
  const files: string[] = []
  for (const src of sources) {
    const list = await collectFileList(src, oldDir)
    files.push(...list.map(f => f.rel))
    total += list.reduce((s, f) => s + f.size, 0)
  }
  let done = 0
  for (const rel of files) {
    const dst = path.join(newDir, rel)
    await fsp.mkdir(path.dirname(dst), { recursive: true })
    await fsp.copyFile(path.join(oldDir, rel), dst)
    done += 1
    report({ phase: 'moving', copiedBytes: done, totalBytes: total })
  }
}

// ---- Alur utama ----

export async function runMigration(deps: MigrationDeps, opts: MigrateOptions): Promise<void> {
  const report = makeReporter(deps.getWindow)
  const oldDir = path.resolve(deps.getDataDir())
  const target = path.resolve(opts.targetDir)
  const backendWasAlive = deps.isBackendAlive()

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
      await fsp.mkdir(target, { recursive: true })
    }

    // Config baru ditulis setelah file selesai dipindah; jika penulisan gagal, rollback ke nilai lama (atau hapus = fallback ke direktori default)
    report({ phase: 'config' }, true)
    const configExisted = fs.existsSync(deps.configPath())
    const oldConfigRaw = configExisted ? fs.readFileSync(deps.configPath(), 'utf8') : null
    try {
      deps.writeConfig(target)
    } catch (err) {
      if (oldConfigRaw !== null) fs.writeFileSync(deps.configPath(), oldConfigRaw)
      else fs.rmSync(deps.configPath(), { force: true })
      throw err
    }

    report({ phase: 'restarting' }, true)
    deps.setDataDir(target)
    deps.startBackend()
    await deps.waitHealthy(deps.getPort(), 20_000)
    deps.markRestartingFalse()
    report({ phase: 'done' }, true)
  } catch (err) {
    const message = (err as Error)?.message || String(err)
    report({ phase: 'error', message }, true)

    // Pemulihan: backend seharusnya dalam kondisi berjalan; jika pemulihan gagal, keluar dari aplikasi secara eksplisit, jangan biarkan jendela zombie
    if (backendWasAlive && !deps.isBackendAlive()) {
      deps.setDataDir(oldDir)
      try {
        deps.startBackend()
        await deps.waitHealthy(deps.getPort(), 20_000)
        deps.markRestartingFalse()
      } catch (recoverErr) {
        console.error('[migrate] Pemulihan backend gagal:', recoverErr)
        dialog.showErrorBox('Huobao Drama', `Migrasi penyimpanan gagal dan pemulihan layanan latar belakang gagal, aplikasi akan ditutup.\nError asli: ${message}`)
        app.quit()
        return
      }
    } else {
      deps.markRestartingFalse()
    }
    throw err
  }
}
