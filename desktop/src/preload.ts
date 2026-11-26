/**
 * preload — secure bridge for the renderer process.
 * Exposes window.huobaoDesktop: directory picking, migration triggering, and migration progress subscriptions.
 * contextIsolation is enabled by default, and only allowlisted methods are exposed via contextBridge.
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('huobaoDesktop', {
  /** Open the native directory picker; returns { ok, path?, freeBytes?, error?, canceled? } */
  pickDirectory: () => ipcRenderer.invoke('huobao:pick-directory'),
  /** Trigger storage migration; returns { ok } or rejects (see progress events / exceptions for errors) */
  startMigration: (opts: { targetDir: string, migrateFiles: boolean }) =>
    ipcRenderer.invoke('huobao:start-migration', opts),
  /** Subscribe to migration progress; returns an unsubscribe function */
  onMigrateProgress: (cb: (progress: { phase: string, copiedBytes?: number, totalBytes?: number, message?: string }) => void) => {
    const listener = (_event: unknown, progress: Parameters<typeof cb>[0]) => cb(progress)
    ipcRenderer.on('huobao:migrate-progress', listener)
    return () => ipcRenderer.removeListener('huobao:migrate-progress', listener)
  },
  // ---- In-app updates ----
  getUpdateState: () => ipcRenderer.invoke('huobao:update-state'),
  checkUpdate: () => ipcRenderer.invoke('huobao:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('huobao:update-download'),
  applyUpdate: () => ipcRenderer.invoke('huobao:update-apply'),
  /** Subscribe to update download progress (0-100); returns an unsubscribe function */
  onUpdateProgress: (cb: (percent: number) => void) => {
    const listener = (_event: unknown, percent: number) => cb(percent)
    ipcRenderer.on('huobao:update-progress', listener)
    return () => ipcRenderer.removeListener('huobao:update-progress', listener)
  },
})
