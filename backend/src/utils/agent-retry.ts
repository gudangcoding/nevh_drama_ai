/**
 * Retry untuk pemanggilan Agent satu-tembak (interaktif / langkah pipeline).
 *
 * Kesalahan sementara (jaringan/5xx/timeout header seperti "Headers Timeout Error")
 * diulang sekali-dua kali agar permintaan tidak langsung gagal saat provider sesaat
 * lambat. Kesalahan pasti (parameter invalid, saldo habis, model tidak ada) dan abort
 * timeout milik sendiri TIDAK diulang agar tidak membakar token.
 */
import { isAgentTimeoutAbort } from './agent-timeout.js'
import { logTaskWarn } from './task-logger.js'

type MinimalAgent = { generate: (messages: any, options: any) => Promise<any> }

export function isTransientAgentError(err: unknown): boolean {
  const raw = String((err as any)?.message || (err as any)?.cause?.message || err || '')
  return /timeout|timed\s?out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|fetch failed|network error|broken pipe|502|503|504|5\d\d/i.test(raw)
}

const RETRY_LIMIT = Number(process.env.AI_AGENT_RETRY || 2)
const RETRY_BACKOFF_MS = Number(process.env.AI_AGENT_RETRY_BACKOFF || 4000)

export async function generateWithRetry(
  agent: MinimalAgent,
  messages: any,
  options: any,
  label: string,
  meta?: Record<string, unknown>,
): Promise<any> {
  let attempt = 0
  for (;;) {
    try {
      return await agent.generate(messages, options)
    } catch (err: any) {
      if (isAgentTimeoutAbort(err) || !isTransientAgentError(err) || attempt >= RETRY_LIMIT) throw err
      attempt++
      logTaskWarn('Agent', 'agent-retry', {
        label,
        attempt,
        maxAttempts: RETRY_LIMIT,
        error: String(err?.message || err),
        ...(meta || {}),
      })
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt))
    }
  }
}
