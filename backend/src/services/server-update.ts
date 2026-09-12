/**
 * Pemeriksaan versi dan pemicuan pembaruan untuk deployment server / Docker
 *
 * - Pemeriksaan versi: menggunakan daftar rilis yang sama dengan versi desktop (latest.json dari HUOBAO_UPDATE_FEED)
 * - Versi saat ini: diinjeksi saat build HUOBAO_VERSION (Docker ARG / environment variable), fallback default ke package.json
 * - Pembaruan sekali klik: hanya tersedia saat Watchtower dikonfigurasi (HUOBAO_WATCHTOWER_URL) — container tidak dapat diubah,
 *   self-update dalam container adalah anti-pattern, jalur yang benar adalah Watchtower menarik image baru dan membangun ulang container ini;
 *   Saat tidak dikonfigurasi frontend menampilkan panduan pembaruan manual (docker compose pull && up -d)
 */
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const FEED_URL = process.env.HUOBAO_UPDATE_FEED
  || 'https://github.com/chatfire-AI/huobao-drama/releases/latest/download/latest.json'

const WATCHTOWER_URL = process.env.HUOBAO_WATCHTOWER_URL?.replace(/\/+$/, '')
const WATCHTOWER_TOKEN = process.env.HUOBAO_WATCHTOWER_TOKEN || ''

export type ServerUpdateMode = 'watchtower' | 'manual'

export interface ServerUpdateState {
  status: 'idle' | 'up-to-date' | 'available' | 'error'
  currentVersion: string
  latestVersion?: string
  notes?: string
  error?: string
  updateMode: ServerUpdateMode
}

let lastState: Omit<ServerUpdateState, 'updateMode'> | null = null

function currentVersion(): string {
  if (process.env.HUOBAO_VERSION) return process.env.HUOBAO_VERSION.replace(/^v/, '')
  try {
    const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json')
    return JSON.parse(readFileSync(pkg, 'utf-8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export function updateMode(): ServerUpdateMode {
  return WATCHTOWER_URL ? 'watchtower' : 'manual'
}

/** Perbandingan tiga segmen numerik dengan aturan yang sama dengan updater versi desktop */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

/** GET /state — versi saat ini + mode pembaruan + hasil pemeriksaan terakhir (tidak memicu request jaringan) */
export function getServerUpdateState(): ServerUpdateState {
  return {
    status: lastState?.status ?? 'idle',
    currentVersion: currentVersion(),
    latestVersion: lastState?.latestVersion,
    notes: lastState?.notes,
    error: lastState?.error,
    updateMode: updateMode(),
  }
}

/** POST /check — menarik daftar rilis untuk membandingkan versi */
export async function checkServerUpdate(): Promise<ServerUpdateState> {
  try {
    const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`Permintaan daftar versi gagal (HTTP ${res.status})`)
    const feed = await res.json()
    if (!feed?.version) throw new Error('Format daftar versi tidak valid')
    const latestVersion = String(feed.version).replace(/^v/, '')
    lastState = {
      status: compareVersions(latestVersion, currentVersion()) > 0 ? 'available' : 'up-to-date',
      currentVersion: currentVersion(),
      latestVersion,
      notes: feed.notes,
    }
  } catch (err) {
    lastState = {
      status: 'error',
      currentVersion: currentVersion(),
      error: (err as Error).message,
    }
  }
  return getServerUpdateState()
}

/**
 * POST /apply — memicu Watchtower untuk segera memeriksa dan membangun ulang container ini
 * Watchtower mengeksekusi secara asinkron: menarik image baru → membangun ulang container, proses ini kemudian digantikan, pemanggil hanya mendapatkan "sudah dipicu"
 */
export async function triggerWatchtowerUpdate(): Promise<void> {
  if (!WATCHTOWER_URL) throw new Error('Watchtower belum dikonfigurasi (HUOBAO_WATCHTOWER_URL), tidak dapat menerapkan pembaruan internal')
  const res = await fetch(`${WATCHTOWER_URL}/v1/update`, {
    method: 'POST',
    headers: WATCHTOWER_TOKEN ? { Authorization: `Bearer ${WATCHTOWER_TOKEN}` } : {},
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Pemicuan Watchtower gagal (HTTP ${res.status})`)
}
