import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, notFound, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { joinProviderUrl } from '../services/adapters/url.js'
import { isOfficialProvider, isSupportedProvider, parseConfigTemperature } from '../services/ai.js'
import { redactUrl, logTaskError, logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

/** Normalisasi parameter temperature: null=tidak disetel; nilai valid 0~2; jika tidak valid lempar error */
function normalizeTemperature(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 2) throw new Error('invalid temperature')
  return n
}

/** Mengekstrak temperature dari JSON settings sebagai field tingkat atas, agar frontend dapat membaca dan menulis secara langsung */
function withParsedFields(r: any) {
  return {
    ...toSnakeCase(r),
    model: r.model ? JSON.parse(r.model) : [],
    temperature: parseConfigTemperature(r.settings),
  }
}

function bearerHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function geminiHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers['x-goog-api-key'] = apiKey
  }
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function buildProbe(serviceType: string, provider: string, baseUrl: string, model?: string, apiKey?: string) {
  const p = provider.toLowerCase()
  const m = model || ''

  if (p === 'gemini') {
    // Probe secara seragam menggunakan generateContent: runtime teks (AI SDK) juga menggunakannya, didukung oleh resmi dan relay;
    // endpoint interactions banyak yang tidak dikonfigurasi oleh relay, probing akan menghasilkan false positive 500.
    // Gunakan request body legal minimum bukan body kosong — body kosong di beberapa relay akan memicu false positive kegagalan autentikasi upstream
    if (serviceType === 'video') {
      // Video: endpoint resmi Veo di API developer hanya mendukung :predictLongRunning
      // (alias :generateVideos lama kini 404). Probe dengan body kosong: tidak memulai tugas
      // penagihan (untuk body penuh akan memulai video berbayar), cukup verifikasi path+auth.
      // Respons yang diharapkan: 400/429/200 → reachable; 404 → endpoint/path salah.
      const modelName = m || 'veo-3.1-generate-preview'
      return {
        method: 'POST',
        url: joinProviderUrl(baseUrl, '/v1beta', `/models/${modelName}:predictLongRunning`),
        headers: geminiHeaders(apiKey, true),
        body: {},
      }
    }
    const modelName = m || 'gemini-3.1-pro-preview'
    const url = new URL(joinProviderUrl(baseUrl, '/v1beta', `/models/${modelName}:generateContent`))
    if (apiKey) url.searchParams.set('key', apiKey)
    return {
      method: 'POST',
      url: url.toString(),
      headers: geminiHeaders(apiKey, true),
      body: { contents: [{ parts: [{ text: 'hi' }] }] },
    }
  }

  if (p === 'openai') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1', '/models'),
      headers: bearerHeaders(apiKey),
      body: undefined,
    }
  }

  // Penyedia teks kustom (kompatibel OpenAI) diterima: provider lain selain gemini/openai/volcengine
  // diperlakukan sebagai endpoint /v1/chat/completions (pola ala Trae / new-api / api.hcnsec.cn).
  // Base URL bisa berisi atau tidak berisi /v1; probe mencoba kedua varian.
  if (serviceType === 'text' && !['gemini', 'openai', 'volcengine'].includes(p)) {
    const candidates = [joinProviderUrl(baseUrl, '/v1', '/models'), joinProviderUrl(baseUrl, '', '/models')]
    const baseURL = candidates[0]
    return {
      method: 'GET',
      url: baseURL,
      headers: bearerHeaders(apiKey),
      body: undefined,
      fallbackUrls: candidates.slice(1),
    }
  }

  if (p === 'volcengine') {
    const path = serviceType === 'video'
      ? '/contents/generations/tasks'
      : serviceType === 'text'
        ? '/chat/completions'
        : '/images/generations'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v3', path),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'minimax') {
    // MiniMax hanya menyediakan layanan video, request body kosong untuk memprobe autentikasi/konektivitas endpoint
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/v2', '/video_generation'),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'aliyun') {
    // Wan 3.0 hanya mendukung pengiriman asinkron; request body kosong tidak akan membuat tugas penagihan, hanya untuk memverifikasi apakah endpoint regional dan autentikasi dapat dijangkau.
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v1', '/services/aigc/video-generation/video-synthesis'),
      headers: {
        ...bearerHeaders(apiKey, true),
        'X-DashScope-Async': 'enable',
      },
      body: {},
    }
  }

  return {
    method: 'GET',
    url: joinProviderUrl(baseUrl, '', m ? `/${m}` : '/'),
    headers: bearerHeaders(apiKey),
    body: undefined,
  }
}

// GET /ai-configs?service_type=text
app.get('/', async (c) => {
  const serviceType = c.req.query('service_type')
  let rows = await db.select().from(schema.aiServiceConfigs)
  if (serviceType) rows = rows.filter(r => r.serviceType === serviceType)

  const parsed = rows.map(withParsedFields)
  return success(c, parsed)
})

// POST /ai-configs
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()

  // Validasi field yang wajib diisi
  if (!body.service_type || !body.provider) {
    return badRequest(c, 'service_type dan provider diperlukan')
  }
  if (!isSupportedProvider(body.service_type, body.provider)) {
    return badRequest(c, 'service_type/provider tidak didukung')
  }

  let temperature: number | null = null
  if ('temperature' in body) {
    try {
      temperature = normalizeTemperature(body.temperature)
    } catch {
      return badRequest(c, 'temperature harus angka antara 0 sampai 2')
    }
  }

  const res = await db.insert(schema.aiServiceConfigs).values({
    serviceType: body.service_type,
    provider: body.provider,
    name: body.name || `${body.provider}-${body.service_type}`,
    baseUrl: body.base_url || '',
    apiKey: body.api_key || '',
    model: JSON.stringify(body.model || []),
    priority: body.priority || 0,
    isActive: true,
    settings: temperature !== null ? JSON.stringify({ temperature }) : null,
    createdAt: ts,
    updatedAt: ts,
  })

  const [row] = await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, getInsertId(res)))

  return created(c, withParsedFields(row))
})

// POST /ai-configs/test
app.post('/test', async (c) => {
  const body = await c.req.json()
  if (!body.service_type || !body.provider || !body.base_url) {
    return badRequest(c, 'service_type, provider, dan base_url diperlukan')
  }
  if (!isSupportedProvider(body.service_type, body.provider)) {
    return badRequest(c, 'service_type/provider tidak didukung')
  }

  const model = Array.isArray(body.model) ? body.model[0] : body.model
  const probe = buildProbe(body.service_type, body.provider, body.base_url, model, body.api_key) as {
    url: string
    method: string
    headers: Record<string, string>
    body?: unknown
    fallbackUrls?: string[]
  }
  const urls = [probe.url, ...(probe.fallbackUrls || [])]
  const probeUrl = redactUrl(urls[0])

  logTaskProgress('AIConfig', 'probe-start', {
    serviceType: body.service_type,
    provider: body.provider,
    method: probe.method,
    url: probeUrl,
  })

  try {
    let resp: Response | null = null
    let usedUrl = urls[0]
    for (const url of urls) {
      const candidate = await fetch(url, {
        method: probe.method,
        headers: probe.headers,
        body: probe.body ? JSON.stringify(probe.body) : undefined,
      })
      resp = candidate
      usedUrl = url
      // 404 pada varian pertama (Base URL tanpa prefiks /v1 yang benar) → coba varian berikutnya
      if (candidate.status !== 404 && candidate.status !== 400) break
    }
    const text = await (resp as Response).text()
    const reachable = [200, 204, 400, 401, 403, 429].includes((resp as Response).status)
    const usedUrlRedacted = redactUrl(usedUrl)
    const status = (resp as Response).status
    let message: string
    if (!reachable) {
      message = 'Endpoint tidak merespons sesuai harapan, periksa Base URL dan prefiks proxy'
    } else if (status === 429) {
      message = 'Endpoint dapat diakses, tetapi kuota/saldo layanan AI habis atau dibatasi (429)'
    } else if ((resp as Response).ok) {
      message = 'Endpoint dapat diakses, autentikasi dan path berfungsi normal'
    } else {
      message = 'Endpoint merespons, periksa kode status untuk memastikan autentikasi/path benar'
    }
    const payload = {
      ok: (resp as Response).ok,
      reachable,
      status,
      status_text: (resp as Response).statusText,
      method: probe.method,
      url: usedUrlRedacted,
      message,
      response_preview: text.slice(0, 240),
    }
    if (reachable) {
      logTaskSuccess('AIConfig', 'probe-done', {
        provider: body.provider,
        status: (resp as Response).status,
        url: usedUrlRedacted,
      })
    } else {
      logTaskError('AIConfig', 'probe-unexpected', {
        provider: body.provider,
        status: (resp as Response).status,
        url: usedUrlRedacted,
      })
    }
    return success(c, payload)
  } catch (error: any) {
    logTaskError('AIConfig', 'probe-failed', {
      provider: body.provider,
      url: probeUrl,
      error: error.message,
    })
    return success(c, {
      ok: false,
      reachable: false,
      method: probe.method,
      url: probeUrl,
      message: error.message || 'Permintaan gagal',
      response_preview: '',
    })
  }
})

// GET /ai-configs/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  if (!row) return notFound(c)
  return success(c, withParsedFields(row))
})

// PUT /ai-configs/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [existing] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  if (!existing) return notFound(c)

  const serviceType = 'service_type' in body ? body.service_type : existing.serviceType
  const provider = 'provider' in body ? body.provider : existing.provider
  if (!isSupportedProvider(serviceType, provider)) {
    return badRequest(c, 'service_type/provider tidak didukung')
  }

  const updates: Record<string, any> = { updatedAt: now() }

  if ('service_type' in body) updates.serviceType = body.service_type
  if ('provider' in body) updates.provider = body.provider
  if ('name' in body) updates.name = body.name
  if ('base_url' in body) updates.baseUrl = body.base_url
  if ('api_key' in body) updates.apiKey = body.api_key
  if ('model' in body) updates.model = JSON.stringify(body.model)
  if ('priority' in body) updates.priority = body.priority
  if ('is_active' in body) updates.isActive = body.is_active
  if ('temperature' in body) {
    let temperature: number | null
    try {
      temperature = normalizeTemperature(body.temperature)
    } catch {
      return badRequest(c, 'temperature harus angka antara 0 sampai 2')
    }
    // Digabungkan dengan settings yang sudah ada, temperature yang dikosongkan dihapus dari JSON
    let settings: Record<string, any> = {}
    try { settings = existing.settings ? JSON.parse(existing.settings) : {} } catch { settings = {} }
    if (temperature === null) delete settings.temperature
    else settings.temperature = temperature
    updates.settings = Object.keys(settings).length ? JSON.stringify(settings) : null
  }

  await db.update(schema.aiServiceConfigs).set(updates).where(eq(schema.aiServiceConfigs.id, id))
  return success(c)
})

// DELETE /ai-configs/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  return success(c)
})

// GET /ai-providers
export const aiProviders = new Hono()
aiProviders.get('/', async (c) => {
  const rows = await db.select().from(schema.aiServiceProviders)
  const parsed = rows.map(r => ({
    ...toSnakeCase(r),
    preset_models: r.presetModels ? JSON.parse(r.presetModels) : [],
  }))
  return success(c, parsed)
})

export default app
