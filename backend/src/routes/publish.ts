/**
 * Rute publikasi sosial — manajemen provider/akun + job upload
 * Scaffold: struktur lengkap, belum diuji e2e; kredensial diisi pengguna di UI.
 */
import { Hono } from 'hono'
import { desc, eq, isNull } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, badRequest, notFound, created, now } from '../utils/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { getUser, isAdmin } from '../services/ownership.js'
import { getPublishAdapter, type PublishProviderConfig } from '../services/publish/adapters.js'
import { generateSeoCopy, createPublishJob, runPublishJob } from '../services/publish/index.js'
import { logTaskError } from '../utils/task-logger.js'

const app = new Hono()

function providerConfig(row: typeof schema.publishProviders.$inferSelect): PublishProviderConfig {
  return {
    provider: row.provider,
    clientId: row.clientId || '',
    clientSecret: row.clientSecret || '',
    scopes: row.scopes || '',
    authUrl: row.authUrl || '',
    tokenUrl: row.tokenUrl || '',
  }
}

// ─── Provider management ───────────────────────────────────────────────────────

// GET /publish — daftar penyedia (termasuk status tersambung per akun user)
app.get('/', async (c) => {
  const user = getUser(c)
  const providers = await db.select().from(schema.publishProviders)
  const accounts = await db.select().from(schema.publishAccounts)
    .where(isAdmin(user) ? isNull(schema.publishAccounts.deletedAt) : eq(schema.publishAccounts.userId, user.id))
  const items = providers.map(p => ({
    ...toSnakeCase(p),
    connected_accounts: accounts.filter(a => a.provider === p.provider).length,
  }))
  return success(c, items)
})

// PUT /publish/providers/:id — simpan kredensial OAuth provider
app.put('/providers/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.publishProviders).where(eq(schema.publishProviders.id, id))
  if (!row) return notFound(c, 'Penyedia publikasi tidak ditemukan')
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.client_id !== undefined) updates.clientId = String(body.client_id)
  if (body.client_secret !== undefined) updates.clientSecret = String(body.client_secret)
  if (body.scopes !== undefined) updates.scopes = String(body.scopes)
  if (body.auth_url !== undefined) updates.authUrl = String(body.auth_url)
  if (body.token_url !== undefined) updates.tokenUrl = String(body.token_url)
  if (body.is_active !== undefined) updates.isActive = !!body.is_active
  await db.update(schema.publishProviders).set(updates).where(eq(schema.publishProviders.id, id))
  return success(c)
})

// ─── OAuth / accounts ──────────────────────────────────────────────────────────

// GET /publish/auth-url?provider=&provider_id=&redirect_uri= — bangun URL OAuth
app.get('/auth-url', async (c) => {
  const providerName = c.req.query('provider') || ''
  const providerId = Number(c.req.query('provider_id') || 0)
  const redirectUri = c.req.query('redirect_uri') || ''
  if (!providerName || !redirectUri) return badRequest(c, 'provider dan redirect_uri diperlukan')

  const [providerRow] = providerId
    ? await db.select().from(schema.publishProviders).where(eq(schema.publishProviders.id, providerId))
    : await db.select().from(schema.publishProviders).where(eq(schema.publishProviders.provider, providerName))
  if (!providerRow) return notFound(c, 'Penyedia publikasi tidak ditemukan')

  const config = providerConfig(providerRow)
  if (!config.clientId) return badRequest(c, 'Client ID belum diisi pada penyedia ini')
  const adapter = getPublishAdapter(providerRow.provider)
  return success(c, { auth_url: adapter.buildAuthUrl(config, redirectUri) })
})

// POST /publish/callback — tukar kode OAuth dengan access token, simpan akun
app.post('/callback', async (c) => {
  const body = await c.req.json()
  const providerName = body.provider || ''
  const providerId = Number(body.provider_id || 0)
  const code = String(body.code || '')
  const redirectUri = String(body.redirect_uri || '')
  if (!providerName || !code || !redirectUri) return badRequest(c, 'provider, code, dan redirect_uri diperlukan')

  const [providerRow] = providerId
    ? await db.select().from(schema.publishProviders).where(eq(schema.publishProviders.id, providerId))
    : await db.select().from(schema.publishProviders).where(eq(schema.publishProviders.provider, providerName))
  if (!providerRow) return notFound(c, 'Penyedia publikasi tidak ditemukan')

  const user = getUser(c)
  const config = providerConfig(providerRow)
  const adapter = getPublishAdapter(providerRow.provider)

  const token = await adapter.exchangeCode(config, code, redirectUri)
  const ts = now()
  const existing = await db.select().from(schema.publishAccounts)
    .where(eq(schema.publishAccounts.userId, user.id))
  const connected = existing.find(a => a.provider === providerRow.provider && !a.deletedAt)

  if (connected) {
    await db.update(schema.publishAccounts).set({
      providerId: providerRow.id,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? connected.refreshToken,
      tokenExpiresAt: token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000).toISOString() : null,
      channelId: token.channelId ?? connected.channelId,
      channelName: token.channelName ?? connected.channelName,
      isActive: true,
      updatedAt: ts,
    }).where(eq(schema.publishAccounts.id, connected.id))
  } else {
    await db.insert(schema.publishAccounts).values({
      userId: user.id,
      providerId: providerRow.id,
      provider: providerRow.provider,
      accountLabel: token.channelName || providerRow.displayName,
      channelName: token.channelName,
      channelId: token.channelId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt: token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000).toISOString() : null,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    })
  }

  const [accountRow] = (await db.select().from(schema.publishAccounts).where(eq(schema.publishAccounts.userId, user.id)))
    .filter(a => a.provider === providerRow.provider && !a.deletedAt)
  return created(c, toSnakeCase(accountRow))
})

// GET /publish/accounts — daftar akun tersambung
app.get('/accounts', async (c) => {
  const user = getUser(c)
  const rows = await db.select().from(schema.publishAccounts)
    .where(isAdmin(user) ? isNull(schema.publishAccounts.deletedAt) : eq(schema.publishAccounts.userId, user.id))
    .orderBy(desc(schema.publishAccounts.updatedAt))
  return success(c, toSnakeCaseArray(rows))
})

// DELETE /publish/accounts/:id — putuskan akun (soft delete)
app.delete('/accounts/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const user = getUser(c)
  const [row] = await db.select().from(schema.publishAccounts).where(eq(schema.publishAccounts.id, id))
  if (!row || (!isAdmin(user) && row.userId !== user.id)) return notFound(c, 'Akun tidak ditemukan')
  await db.update(schema.publishAccounts).set({ deletedAt: now() }).where(eq(schema.publishAccounts.id, id))
  return success(c)
})

// ─── SEO copy & jobs ───────────────────────────────────────────────────────────

// POST /publish/seo — generate judul/deskripsi/tag SEO dari episode
app.post('/seo', async (c) => {
  const body = await c.req.json()
  const dramaId = Number(body.drama_id)
  const episodeId = body.episode_id ? Number(body.episode_id) : undefined
  if (!dramaId) return badRequest(c, 'drama_id diperlukan')
  try {
    const seo = await generateSeoCopy({ dramaId, episodeId })
    return success(c, seo)
  } catch (err: any) {
    return badRequest(c, err?.message || 'Gagal menghasilkan materi publikasi')
  }
})

// POST /publish/jobs — buat job publish (upload berjalan di latar belakang)
app.post('/jobs', async (c) => {
  const body = await c.req.json()
  const dramaId = Number(body.drama_id)
  const episodeId = Number(body.episode_id)
  const accountId = Number(body.account_id)
  const provider = String(body.provider || '')
  if (!dramaId || !episodeId || !accountId || !provider) {
    return badRequest(c, 'drama_id, episode_id, account_id, dan provider diperlukan')
  }
  const user = getUser(c)
  // Cek kepemilikan akun + episode
  const [account] = await db.select().from(schema.publishAccounts).where(eq(schema.publishAccounts.id, accountId))
  if (!account || (!isAdmin(user) && account.userId !== user.id)) return notFound(c, 'Akun tidak ditemukan')
  try {
    const jobId = await createPublishJob({
      userId: user.id,
      dramaId,
      episodeId,
      accountId,
      provider,
      title: body.title,
      description: body.description,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
    })
    const [job] = await db.select().from(schema.publishJobs).where(eq(schema.publishJobs.id, jobId))
    return created(c, toSnakeCase(job))
  } catch (err: any) {
    return badRequest(c, err?.message || 'Gagal membuat job publikasi')
  }
})

// GET /publish/jobs — daftar job
app.get('/jobs', async (c) => {
  const user = getUser(c)
  const rows = await db.select().from(schema.publishJobs)
    .where(isAdmin(user) ? undefined : eq(schema.publishJobs.userId, user.id))
    .orderBy(desc(schema.publishJobs.updatedAt))
  return success(c, toSnakeCaseArray(rows).map((j: any) => ({ ...j, tags: j.tags ? JSON.parse(j.tags) : [] })))
})

// POST /publish/jobs/:id/run — jalankan ulang job gagal
app.post('/jobs/:id/run', async (c) => {
  const id = Number(c.req.param('id'))
  const user = getUser(c)
  const [job] = await db.select().from(schema.publishJobs).where(eq(schema.publishJobs.id, id))
  if (!job || (!isAdmin(user) && job.userId !== user.id)) return notFound(c, 'Job tidak ditemukan')
  try {
    void runPublishJob(id).catch(err => logTaskError('Publish', 'job-rerun', { jobId: id, error: err.message }))
    return success(c, { jobId: id })
  } catch (err: any) {
    return badRequest(c, err?.message || 'Gagal menjalankan ulang job')
  }
})

export default app