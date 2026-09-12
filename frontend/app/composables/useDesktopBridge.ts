/**
 * Jembatan desktop (tipe yang diinjeksi melalui preload ke window.huobaoDesktop) dan nilai aman.
 * Non-desktop environment (browser/server deployment) mengembalikan null, UI menyembunyikan fitur khas desktop berdasarkan hal tersebut.
 */

export interface UpdateState {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  latestVersion?: string
  notes?: string
  error?: string
  downloadProgress?: number
  downloadedFile?: string
}

export interface HuobaoDesktopBridge {
  pickDirectory: () => Promise<{ ok: boolean, path?: string, freeBytes?: number | null, error?: string, canceled?: boolean }>
  startMigration: (opts: { targetDir: string, migrateFiles: boolean }) => Promise<{ ok: boolean }>
  onMigrateProgress: (cb: (progress: { phase: string, message?: string, copiedBytes?: number, totalBytes?: number }) => void) => () => void
  getUpdateState: () => Promise<UpdateState>
  checkUpdate: () => Promise<UpdateState>
  downloadUpdate: () => Promise<UpdateState>
  applyUpdate: () => Promise<void>
  onUpdateProgress: (cb: (percent: number) => void) => () => void
}

export function useDesktopBridge(): HuobaoDesktopBridge | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { huobaoDesktop?: HuobaoDesktopBridge }).huobaoDesktop ?? null
}
