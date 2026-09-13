/**
 * Lapisan HTTP tahan-gagal untuk pemanggilan API AI eksternal.
 *
 * Latar belakang: fetch global Node (undici) memakai connect timeout default 10s,
 * sehingga saat jaringan ke Google/Gemini sedang tidak stabil, pembuatan asset sering
 * gagal dengan "Cannot connect to API: Connect Timeout Error (... timeout: 10000ms)".
 *
 * Solusi:
 * - Dispatcher undici dengan connect timeout lebih panjang (default 30s, env AI_CONNECT_TIMEOUT_MS),
 *   sekaligus timeout header/body yang masuk akal untuk generasi model yang lambat.
 * - Retry otomatis dengan backoff pada error transien (connect timeout, ECONNRESET,
 *   socket hang up, fetch failed) dan status yang bisa dicoba ulang (408/425/429/5xx).
 */
import { Agent } from 'undici'

const CONNECT_TIMEOUT_MS = clampPositive(process.env.AI_CONNECT_TIMEOUT_MS, 30_000, 5_000, 120_000)
const DEFAULT_MAX_RETRIES = 2
const BASE_DELAY_MS = 1_200
const MAX_DELAY_MS = 15_000

let agentSingleton: Agent | undefined

function getAgent(): Agent {
  if (!agentSingleton) {
    agentSingleton = new Agent({
      connect: { timeout: CONNECT_TIMEOUT_MS },
      headersTimeout: 120_000,
      bodyTimeout: 600_000,
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 60_000,
      keepAliveTimeoutThreshold: 30_000,
      pipelining: 1,
    })
  }
  return agentSingleton
}

function clampPositive(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export type RequestInitWithDispatcher = RequestInit & { dispatcher?: Agent }

/**
 * Menentukan apakah error jaringan tergolong transien (layak dicoba ulang).
 * AbortError yang dipicu panggil (mis. signal timeout eksternal) TIDAK dicoba ulang.
 */
export function isTransientNetworkError(err: unknown): boolean {
  const e = err as { name?: string; message?: string; code?: string } | undefined
  const name = String(e?.name || '')
  const message = String(e?.message || '')
  if (name === 'AbortError') return false
  return /connect timeout|cannot connect|fetch failed|econnreset|econnrefused|etimedout|socket hang up|network (error|failure|unreachable)|und_err|503|502|504|\b429\b/i.test(`${name} ${message}`)
}

/** Status HTTP yang boleh dicoba ulang (transien di sisi server) */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

export interface RobustFetchOptions {
  maxRetries?: number
  baseDelayMs?: number
}

/**
 * fetch dengan dispatcher undici (connect timeout panjang) + retry backoff untuk error transien.
 * Mengembalikan Response TERAKHIR (termasuk yang tidak ok) jika semua percobaan habis,
 * atau melempar error jaringan terakhir jika fetch terus menerus gagal.
 */
export async function robustFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: RobustFetchOptions = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  const baseDelayMs = opts.baseDelayMs ?? BASE_DELAY_MS
  const url = typeof input === 'string' || input instanceof URL ? input : input.url
  const dispatcherInit: RequestInitWithDispatcher = { ...init, dispatcher: getAgent() }

  const callerSignal = init.signal as AbortSignal | undefined
  let lastResponse: Response | null = null
  let lastError: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResponse = null
    lastError = null
    try {
      const resp = await fetch(url, dispatcherInit)
      lastResponse = resp
      if (resp.ok || !isRetryableStatus(resp.status)) return resp
    } catch (err) {
      lastError = err
      const abortedByCaller = callerSignal?.aborted || (err as { name?: string })?.name === 'AbortError'
      if (abortedByCaller || !isTransientNetworkError(err)) throw err
    }

    if (attempt === maxRetries) break

    // Hanya melepas koneksi bila akan mencoba ulang. JANGAN menguras body response
    // percobaan terakhir: nanti pemanggil membaca text()/json() untuk melihat error asli provider.
    await lastResponse?.arrayBuffer().catch(() => undefined)

    const retryAfter = lastResponse
      ? Number(lastResponse.headers.get('retry-after') || 0)
      : 0
    const delay = retryAfter > 0
      ? Math.min(retryAfter * 1000, MAX_DELAY_MS)
      : Math.min(baseDelayMs * (2 ** attempt), MAX_DELAY_MS)
    await sleep(delay)
  }

  if (lastError) throw lastError
  return lastResponse as Response
}