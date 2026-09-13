import { Hono } from 'hono'
import { and, eq, isNull, desc } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, badRequest, notFound, created, now } from '../utils/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { startProduction, approveProduction, cancelProduction, resumeProduction, getProductionStatus } from '../services/production.js'
import { generateDramaCover } from '../services/covers.js'
import { getUser, isAdmin, assertDramaAccess } from '../services/ownership.js'

const app = new Hono()

// GET /dramas - List dramas
app.get('/', async (c) => {
  const page = Number(c.req.query('page') || 1)
  const pageSize = Number(c.req.query('page_size') || 20)
  const status = c.req.query('status')
  const keyword = c.req.query('keyword')

  const user = getUser(c)
  const owned = isAdmin(user) ? undefined : eq(schema.dramas.userId, user.id)
  const base = owned ? and(owned, isNull(schema.dramas.deletedAt)) : isNull(schema.dramas.deletedAt)
  const allRows = await db.select().from(schema.dramas)
    .where(base)
    .orderBy(desc(schema.dramas.updatedAt))
  let filtered = allRows

  if (status) filtered = filtered.filter(d => d.status === status)
  if (keyword) filtered = filtered.filter(d => d.title.includes(keyword))

  const total = filtered.length
  const items = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Attach episode/character/scene counts
  const enriched = await Promise.all(items.map(async (drama) => {
    const eps = await db.select().from(schema.episodes)
      .where(and(eq(schema.episodes.dramaId, drama.id), isNull(schema.episodes.deletedAt)))
    const chars = await db.select().from(schema.characters)
      .where(eq(schema.characters.dramaId, drama.id))
    const scns = await db.select().from(schema.scenes)
      .where(eq(schema.scenes.dramaId, drama.id))
    return {
      ...toSnakeCase(drama),
      tags: drama.tags ? JSON.parse(drama.tags) : [],
      total_episodes: eps.length,
      episodes: toSnakeCaseArray(eps),
      characters: toSnakeCaseArray(chars),
      scenes: toSnakeCaseArray(scns),
    }
  }))

  return success(c, {
    items: enriched,
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  })
})

// POST /dramas - Create drama
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  // Metadata adalah JSON bebas; cover_prompt dari draft sinopsis disimpan di dalamnya agar bisa dipakai untuk generate sampul
  let metadata: any = null
  if (body.metadata || body.cover_prompt) {
    let parsed: any = {}
    try { parsed = typeof body.metadata === 'string' ? JSON.parse(body.metadata) : (body.metadata || {}) } catch { parsed = body.metadata || {} }
    if (body.cover_prompt !== undefined && typeof parsed === 'object') parsed.cover_prompt = String(body.cover_prompt)
    metadata = typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed)
  }
  const res = await db.insert(schema.dramas).values({
    title: body.title,
    description: body.description,
    synopsis: body.synopsis,
    genre: body.genre,
    style: body.style,
    aspectRatio: body.aspect_ratio || '16:9',
    totalEpisodes: body.total_episodes || 1,
    tags: body.tags ? JSON.stringify(body.tags) : null,
    thumbnail: body.thumbnail || null,
    metadata,
    status: 'draft',
    userId: getUser(c).id,
    createdAt: ts,
    updatedAt: ts,
  })
  const dramaId = getInsertId(res)
  const result = (await db.select().from(schema.dramas)
    .where(eq(schema.dramas.id, dramaId)))[0]

  // Produksi otomatis: bangun semua episode (skrip, aset, gambar) di latar belakang
  let production = null
  const autoGenerate = body.auto_generate || body.autoGenerate
  if (autoGenerate && (body.synopsis || '').trim()) {
    try {
      production = toSnakeCase(await startProduction(dramaId, { auto_video: !!body.auto_video }))
    } catch (err: any) {
      console.error('[POST /dramas] auto production failed:', err)
      return badRequest(c, err?.message || 'Gagal memulai produksi otomatis')
    }
  } else if (autoGenerate) {
    return badRequest(c, 'Tambahkan sinopsis terlebih dahulu untuk produksi otomatis')
  }

  // Sampul otomatis: membuat proyek dari draft sinopsis → generate cover via prompt (async, task di latar belakang)
  let coverTaskId: number | null = null
  const generateCover = body.generate_cover || body.generateCover
  if (generateCover && body.cover_prompt !== undefined) {
    try {
      coverTaskId = await generateDramaCover(dramaId, { prompt: body.cover_prompt })
    } catch (err: any) {
      console.error('[POST /dramas] cover generation failed:', err)
    }
  }

  return created(c, { ...toSnakeCase(result), production, cover_task_id: coverTaskId })
})


// GET /dramas/stats — must be before /:id
app.get('/stats', async (c) => {
  const user = getUser(c)
  const owned = isAdmin(user) ? undefined : eq(schema.dramas.userId, user.id)
  const base = owned ? and(owned, isNull(schema.dramas.deletedAt)) : isNull(schema.dramas.deletedAt)
  const all = await db.select().from(schema.dramas).where(base)
  const byStatus = Object.entries(
    all.reduce((acc, d) => {
      acc[d.status || 'draft'] = (acc[d.status || 'draft'] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).map(([status, count]) => ({ status, count }))
  return success(c, { total: all.length, by_status: byStatus })
})

// GET /dramas/:id - Get drama detail
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await assertDramaAccess(c, id)
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, id))
  if (!drama) return notFound(c, 'Drama tidak ditemukan')

  const eps = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, id), isNull(schema.episodes.deletedAt)))
  const chars = await db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, id))
  const scns = await db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, id))
  const prps = await db.select().from(schema.props)
    .where(eq(schema.props.dramaId, id))

  return success(c, {
    ...toSnakeCase(drama),
    tags: drama.tags ? JSON.parse(drama.tags) : [],
    episodes: toSnakeCaseArray(eps),
    characters: toSnakeCaseArray(chars),
    scenes: toSnakeCaseArray(scns),
    props: toSnakeCaseArray(prps),
  })
})

// PUT /dramas/:id - Update drama
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await assertDramaAccess(c, id)
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.synopsis !== undefined) updates.synopsis = body.synopsis
  if (body.genre !== undefined) updates.genre = body.genre
  if (body.style !== undefined) updates.style = body.style
  if (body.aspect_ratio !== undefined) updates.aspectRatio = body.aspect_ratio
  if (body.status !== undefined) updates.status = body.status
  if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags)
  if (body.thumbnail !== undefined) updates.thumbnail = body.thumbnail
  if (body.metadata !== undefined) updates.metadata = body.metadata
  await db.update(schema.dramas).set(updates).where(eq(schema.dramas.id, id))
  return success(c)
})

// DELETE /dramas/:id - Soft delete
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await assertDramaAccess(c, id)
  await db.update(schema.dramas).set({ deletedAt: now() }).where(eq(schema.dramas.id, id))
  return success(c)
})

// POST /dramas/:id/cover - Generate/regenerate sampul proyek dari prompt (async, tulis ke dramas.thumbnail)
app.post('/:id/cover', async (c) => {
  const id = Number(c.req.param('id'))
  await assertDramaAccess(c, id)
  const body = await c.req.json().catch(() => ({}))
  try {
    const taskId = await generateDramaCover(id, {
      prompt: body.prompt,
      configId: body.config_id ? Number(body.config_id) : undefined,
      size: body.size,
    })
    return success(c, { taskId })
  } catch (err: any) {
    return badRequest(c, err?.message || 'Gagal membuat sampul proyek')
  }
})

// ─── Produksi otomatis lintas-episode ─────────────────────────────────────────

// GET /dramas/:id/production - Status job produksi (null jika belum pernah dimulai)
app.get('/:id/production', async (c) => {
  const id = Number(c.req.param('id'))
  await assertDramaAccess(c, id)
  try {
    const status = await getProductionStatus(id)
    return success(c, { production: status })
  } catch (err: any) {
    return badRequest(c, err?.message || 'Gagal membaca status produksi')
  }
})

// POST /dramas/:id/production/start - Mulai produksi otomatis
app.post('/:id/production/start', async (c) => {
  const id = Number(c.req.param('id'))
  await assertDramaAccess(c, id)
  const body = await c.req.json().catch(() => ({}))
  try {
    const job = await startProduction(id, {
      text_config_id: body.text_config_id,
      text_model: body.text_model,
      image_config_id: body.image_config_id,
      video_config_id: body.video_config_id,
      episode_resolution: body.episode_resolution,
      auto_video: !!body.auto_video,
    })
    return success(c, { production: toSnakeCase(job) })
  } catch (err: any) {
    return badRequest(c, err?.message || 'Gagal memulai produksi')
  }
})

// POST /dramas/:id/production/approve - Setujui alur cerita & adegan, lanjutkan pembuatan video
app.post('/:id/production/approve', async (c) => {
  const id = Number(c.req.param('id'))
  await assertDramaAccess(c, id)
  try {
    const job = await approveProduction(id)
    return success(c, { production: toSnakeCase(job) })
  } catch (err: any) {
    return badRequest(c, err?.message || 'Gagal menyetujui produksi')
  }
})

// POST /dramas/:id/production/cancel - Batalkan produksi
app.post('/:id/production/cancel', async (c) => {
  const id = Number(c.req.param('id'))
  await assertDramaAccess(c, id)
  try {
    const job = await cancelProduction(id)
    return success(c, { production: toSnakeCase(job) })
  } catch (err: any) {
    return badRequest(c, err?.message || 'Gagal membatalkan produksi')
  }
})

// POST /dramas/:id/production/resume - Lanjutkan produksi yang gagal/terputus/selesai dibatalkan
app.post('/:id/production/resume', async (c) => {
  const id = Number(c.req.param('id'))
  await assertDramaAccess(c, id)
  try {
    const job = await resumeProduction(id)
    return success(c, { production: toSnakeCase(job) })
  } catch (err: any) {
    return badRequest(c, err?.message || 'Gagal melanjutkan produksi')
  }
})

// PUT /dramas/:id/characters - Save characters
app.put('/:id/characters', async (c) => {
  const dramaId = Number(c.req.param('id'))
  await assertDramaAccess(c, dramaId)
  const body = await c.req.json()
  const chars = body.characters || []
  const ts = now()

  for (const char of chars) {
    if (char.id) {
      await db.update(schema.characters).set({ ...char, updatedAt: ts }).where(eq(schema.characters.id, char.id))
    } else {
      await db.insert(schema.characters).values({ ...char, dramaId, createdAt: ts, updatedAt: ts })
    }
  }
  return success(c)
})

// PUT /dramas/:id/episodes - Save episodes
app.put('/:id/episodes', async (c) => {
  const dramaId = Number(c.req.param('id'))
  await assertDramaAccess(c, dramaId)
  const body = await c.req.json()
  const episodes = body.episodes || []
  const ts = now()

  for (const ep of episodes) {
    if (ep.id) {
      await db.update(schema.episodes).set({ ...ep, updatedAt: ts }).where(eq(schema.episodes.id, ep.id))
    } else {
      await db.insert(schema.episodes).values({
        ...ep,
        dramaId,
        episodeNumber: ep.episode_number || ep.episodeNumber || 1,
        title: ep.title || 'Tanpa judul',
        createdAt: ts,
        updatedAt: ts,
      })
    }
  }
  return success(c)
})

export default app
