import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateImage } from '../services/generation.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { ensurePropFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { assertDramaAccess, assertPropAccess } from '../services/ownership.js'

const app = new Hono()
// Gambar properti: benda mati berlatar putih, kanvas persegi
const PROP_IMAGE_SIZE = '1024x1024'

// POST /props — tambah properti secara manual (saat mengirim episode_id, hubungkan ke episode tersebut)
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id wajib diisi')
  await assertDramaAccess(c, Number(body.drama_id))
  if (!body.name?.trim()) return badRequest(c, 'Nama wajib diisi')
  const ts = now()
  const res = await db.insert(schema.props).values({
    name: body.name.trim(),
    type: body.type || '',
    description: body.description || '',
    dramaId: body.drama_id,
    createdAt: ts,
    updatedAt: ts,
  })
  const propId = getInsertId(res)
  if (body.episode_id) {
    const existing = await db.select().from(schema.episodeProps)
      .where(and(eq(schema.episodeProps.episodeId, Number(body.episode_id)), eq(schema.episodeProps.propId, propId)))
    if (!existing.length) {
      await db.insert(schema.episodeProps).values({ episodeId: Number(body.episode_id), propId, createdAt: ts })
    }
  }
  const [row] = await db.select().from(schema.props).where(eq(schema.props.id, propId))
  return created(c, toSnakeCase(row))
})

// DELETE /props/:id — hapus lunak
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await assertPropAccess(c, id)
  await db.update(schema.props).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.props.id, id))
  return success(c)
})

// PUT /props/:id — perbarui properti (penampilan objek/tipe/prompt akhir)
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await assertPropAccess(c, id)
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.name !== undefined) updates.name = body.name
  if (body.type !== undefined) updates.type = body.type
  if (body.description !== undefined) updates.description = body.description
  // Pengguna mengunggah gambar properti: langsung tulis alamat gambar dan jalur lokal
  if (body.image_url !== undefined) updates.imageUrl = body.image_url
  else if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl
  if (body.local_path !== undefined) updates.localPath = body.local_path
  else if (body.localPath !== undefined) updates.localPath = body.localPath
  // Saat mengedit prompt akhir secara manual, nilai yang dikirim yang diambil; jika tidak dikirim, nilai asli dipertahankan (saat mengubah info, tidak lagi secara otomatis di-reset ke kosong)
  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null
  await db.update(schema.props).set(updates).where(eq(schema.props.id, id))
  return success(c)
})

/** Prompt akhir lokal: benda mati berlatar putih, tidak mencampurkan elemen lain */
function propImagePrompt(prop: typeof schema.props.$inferSelect, stylePrompt = '') {
  return [
    stylePrompt || '',
    `single product photo of ${prop.name}`,
    prop.description || '',
    'isolated on a pure white background',
    'no other objects, no people, no scenery',
    'soft even studio lighting',
    'high detail',
    'no text, no watermark',
  ].filter(Boolean).join(', ')
}

// POST /props/:id/generate-prompt — generate/ulang secara mandiri prompt akhir benda mati berlatar putih (tanpa menghasilkan gambar)
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  await assertPropAccess(c, id)
  const body = await c.req.json()
  const [prop] = await db.select().from(schema.props).where(eq(schema.props.id, id))
  if (!prop) return badRequest(c, 'Properti tidak ditemukan')
  if (!body.episode_id) return badRequest(c, 'episode_id wajib diisi')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode tidak ditemukan')
  if (ep.dramaId !== prop.dramaId) return badRequest(c, 'Properti dan episode tidak berada di drama yang sama')

  logTaskStart('FinalPrompt', 'prop-generate', { propId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensurePropFinalPrompt(prop, ep.id, !!body.force, { model: body.text_model, configId: body.text_config_id ?? undefined })
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'prop-generate', { propId: id, error: 'agent returned empty prompt' })
    return badRequest(c, 'Gagal membuat prompt akhir, silakan coba lagi')
  }
  logTaskSuccess('FinalPrompt', 'prop-generate', { propId: id })
  return success(c, { final_prompt: finalPrompt })
})

// POST /props/:id/generate-image — Generate gambar prop putih background
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  await assertPropAccess(c, id)
  const body = await c.req.json()
  const [prop] = await db.select().from(schema.props).where(eq(schema.props.id, id))
  if (!prop) return badRequest(c, 'Properti tidak ditemukan')
  if (!body.episode_id) return badRequest(c, 'episode_id wajib diisi')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode tidak ditemukan')
  if (ep.dramaId !== prop.dramaId) return badRequest(c, 'Properti dan episode tidak berada di drama yang sama')

  const stylePrompt = await getDramaStylePrompt(prop.dramaId)
  const finalPrompt = await ensurePropFinalPrompt(prop, ep.id, false, { model: body.text_model, configId: body.text_config_id ?? undefined })
  const prompt = finalPrompt || propImagePrompt(prop, stylePrompt)
  try {
    logTaskStart('PropImage', 'generate', { propId: id, episodeId: ep.id, dramaId: prop.dramaId })
    const genId = await generateImage({ propId: id, dramaId: prop.dramaId, prompt, model: body.model, size: PROP_IMAGE_SIZE, configId: body.config_id ?? ep.imageConfigId ?? undefined })
    logTaskSuccess('PropImage', 'generate', { propId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('PropImage', 'generate', { propId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

export default app
