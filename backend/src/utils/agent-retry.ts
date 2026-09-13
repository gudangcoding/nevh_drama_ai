/**
 * Retry untuk pemanggilan Agent satu-tembak (interaktif / langkah pipeline).
 *
 * Kesalahan sementara (jaringan/5xx/timeout header seperti "Headers Timeout Error")
 * diulang sekali-dua kali agar permintaan tidak langsung gagal saat provider sesaat
 * lambat. Kesalahan pasti (parameter invalid, saldo habis, model tidak ada) dan abort
 * timeout milik sendiri TIDAK diulang agar tidak membakar token.
 */
import { isAgentTimeoutAbort } from './agent-timeout.js'
import { logTaskWarn, logTaskProgress } from './task-logger.js'

type MinimalAgent = { generate: (messages: any, options: any) => Promise<any> }

export function isTransientAgentError(err: unknown): boolean {
  const raw = String((err as any)?.message || (err as any)?.cause?.message || err || '')
  return /timeout|timed\s?out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|fetch failed|network error|broken pipe|502|503|504|5\d\d/i.test(raw)
}

// ─── Token usage logging ──────────────────────────────────────────────────────

/** Extract token counts from Mastra/AI-SDK generate result (handles v4 & v5 shapes). */
export function readAgentUsage(result: unknown): {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  totalTokens?: number
} | null {
  const r: any = result || {}
  const u = r.totalUsage || r.usage || (Array.isArray(r.steps) && r.steps.length ? r.steps[r.steps.length - 1]?.usage : undefined)
  if (!u || typeof u !== 'object') return null
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
  const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined)
  // v5 may expose inputTokens/outputTokens as {total, text, reasoning} objects
  const inObj = obj(u.inputTokens)
  const outObj = obj(u.outputTokens)
  const inTok = num(u.inputTokens) ?? num(inObj?.total) ?? num(inObj?.text)
  const outTok = num(u.outputTokens) ?? num(outObj?.total) ?? num(outObj?.text)
  const reasoningIn = num(inObj?.reasoning)
  const reasoningOut = num(outObj?.reasoning)
  const reasoning = (reasoningIn ?? 0) + (reasoningOut ?? 0) || undefined
  return {
    inputTokens: inTok ?? undefined,
    outputTokens: outTok ?? undefined,
    reasoningTokens: reasoning,
    cachedInputTokens: num(u.cachedInputTokens ?? u.cacheReadInputTokens) ?? undefined,
    totalTokens: num(u.totalTokens) ?? undefined,
  }
}

export function logAgentUsage(label: string, result: unknown, meta?: Record<string, unknown>) {
  const u = readAgentUsage(result)
  if (!u) return
  const steps = Array.isArray((result as any)?.steps) ? (result as any).steps.length : undefined
  logTaskProgress('Agent', 'token-usage', {
    label,
    steps,
    ...u,
    ...(meta || {}),
  })
}

// ─── Retry logic ──────────────────────────────────────────────────────────────

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
      const result = await agent.generate(messages, options)
      logAgentUsage(label, result, meta)
      return result
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
