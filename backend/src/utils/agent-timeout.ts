/**
 * Penjaga waktu (timeout) untuk pemanggilan Agent Mastra.
 *
 * Latar belakang: pemanggilan agent.generate() multi-langkah bisa menggantung selamanya
 * saat provider AI macet (socket setengah terbuka, model tidak membalas streaming).
 * Tanpa pentungan, satu fase produksi hang tak berbatas DAN antrian produksi global
 * ikut macet (semua drama berhenti). Helper ini memasang abortSignal proporsional
 * terhadap maxSteps agar kerja lambat terbatalkan lalu ditandai gagal / di-retry,
 * bukan menggantung beku.
 *
 * Rumus default: AI_AGENT_BASE_TIMEOUT_MS + maxSteps * AI_AGENT_STEP_TIMEOUT_MS
 * (default 180s + 45s/langkah → 12 langkah ≈ 12 mnt, 40 langkah ≈ 33 mnt).
 */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

const BASE_MS = clamp(Number(process.env.AI_AGENT_BASE_TIMEOUT_MS || 180_000), 15_000, 600_000)
const PER_STEP_MS = clamp(Number(process.env.AI_AGENT_STEP_TIMEOUT_MS || 45_000), 5_000, 180_000)
const MAX_TOTAL_MS = clamp(Number(process.env.AI_AGENT_MAX_TIMEOUT_MS || 3_600_000), 60_000, 18_000_000)

export function agentTimeoutMs(maxSteps = 12): number {
  return Math.min(BASE_MS + maxSteps * PER_STEP_MS, MAX_TOTAL_MS)
}

/** AbortSignal untuk dipasang ke opsi agent.generate (Mastra mendukung opsi abortSignal) */
export function agentAbortSignal(maxSteps = 12): AbortSignal {
  return AbortSignal.timeout(agentTimeoutMs(maxSteps))
}

/**
 * Deteksi error yang berasal dari OUR abortSignal (bukan error jaringan/5xx dari provider).
 * Sesi multi-langkah yang di-abort karena terlalu lama TIDAK layak di-retry: mengulang
 * seluruh belasan/empat-puluhan langkah dari nol hanya membakar token; lebih baik mark
 * gagal lalu dilanjutkan via resume saat provider lebih senggang.
 */
export function isAgentTimeoutAbort(err: unknown): boolean {
  const e = err as { name?: string; cause?: { name?: string } } | null | undefined
  if (!e) return false
  return e.name === 'TimeoutError' || e.cause?.name === 'TimeoutError'
}