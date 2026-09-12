/**
 * Rute informasi lokasi penyimpanan — sumber data kartu "Lokasi Penyimpanan" di halaman pengaturan
 *
 * GET / → mode saat ini (desktop/server), jalur direktori, penggunaan disk (berdasarkan bucket) dan ruang tersisa.
 * Perhitungan penggunaan berat (whole-directory walk): cache memori 60s TTL + stale-while-revalidate,
 * saat kedaluwarsa langsung kembali nilai lama dan hitung ulang di background (computing anti-concurrency); nilai pertama kali baru menunggu sinkron.
 */
import { Hono } from 'hono'
import { DATA_ROOT, STORAGE_ROOT } from '../utils/paths.js'
import { dbPath } from '../db/index.js'
import { dirUsage, volumeFreeBytes } from '../utils/dirsize.js'
import { success } from '../utils/response.js'

const app = new Hono()

const USAGE_TTL_MS = 60_000

interface UsageCache {
  usage: Awaited<ReturnType<typeof dirUsage>> | null
  computedAt: string | null
  computing: boolean
}
const cache: UsageCache = { usage: null, computedAt: null, computing: false }

async function computeUsage() {
  if (cache.computing) return
  cache.computing = true
  try {
    const usage = await dirUsage(DATA_ROOT, dbPath)
    cache.usage = usage
    cache.computedAt = new Date().toISOString()
  } finally {
    cache.computing = false
  }
}

// Setelah startup, hangatkan sekali di background 10s, pengguna masuk halaman pengaturan kemungkinan besar sudah mengenali cache
const warmup = setTimeout(() => { void computeUsage() }, 10_000)
warmup.unref?.()

app.get('/', async (c) => {
  const fresh = cache.computedAt && (Date.now() - new Date(cache.computedAt).getTime()) < USAGE_TTL_MS
  let usageStale = false
  if (!fresh) {
    if (cache.usage) {
      // stale-while-revalidate: kembali nilai lama dulu, hitung ulang di background
      usageStale = true
      void computeUsage()
    } else {
      // Nilai pertama kali tidak ada, tunggu hitungan pertama secara sinkron (jamin masuk halaman sudah ada data)
      await computeUsage()
    }
  }

  const mode = process.env.HUOBAO_DESKTOP === '1' ? 'desktop' : 'server'
  return success(c, {
    mode,
    dataDir: DATA_ROOT,
    storageRoot: STORAGE_ROOT,
    sqlitePath: dbPath,
    usage: cache.usage,
    usageStale: usageStale || cache.computing,
    computedAt: cache.computedAt,
    freeBytes: await volumeFreeBytes(DATA_ROOT),
  })
})

export default app
