import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, notFound, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'

const app = new Hono()

const VALUE_PATTERN = /^[a-z0-9][a-z0-9-]*$/

// GET /style-presets — default hanya mengembalikan item yang diaktifkan, ?all=1 mengembalikan semua
app.get('/', async (c) => {
  const all = c.req.query('all') === '1'
  const rows = await db.select().from(schema.stylePresets)
  const filtered = all ? rows : rows.filter(r => r.isActive)
  filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.id - b.id)
  return success(c, filtered.map(r => toSnakeCase(r)))
})

// POST /style-presets — tambah preset gaya
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.name?.trim()) return badRequest(c, 'Nama gaya wajib diisi')
  if (!body.value?.trim()) return badRequest(c, 'Kunci gaya wajib diisi')
  if (!VALUE_PATTERN.test(body.value.trim())) return badRequest(c, 'Kunci gaya hanya mendukung huruf kecil, angka, dan tanda hubung')
  if (!body.prompt?.trim()) return badRequest(c, 'Fragmen prompt wajib diisi')

  const value = body.value.trim()
  const [dup] = await db.select().from(schema.stylePresets)
    .where(eq(schema.stylePresets.value, value))
  if (dup) return badRequest(c, 'Kunci gaya sudah ada')

  const ts = now()
  const res = await db.insert(schema.stylePresets).values({
    name: body.name.trim(),
    value,
    prompt: body.prompt.trim(),
    description: body.description || null,
    sortOrder: Number(body.sort_order ?? body.sortOrder ?? 0),
    isActive: body.is_active === false || body.is_active === 0 ? false : true,
    createdAt: ts,
    updatedAt: ts,
  })
  const [row] = await db.select().from(schema.stylePresets)
    .where(eq(schema.stylePresets.id, getInsertId(res)))
  return created(c, toSnakeCase(row))
})

// PUT /style-presets/:id — perbarui (value tidak dapat diubah setelah dibuat)
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [row] = await db.select().from(schema.stylePresets)
    .where(eq(schema.stylePresets.id, id))
  if (!row) return notFound(c, 'Preset gaya tidak ditemukan')

  const updates: Record<string, any> = { updatedAt: now() }
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.prompt !== undefined) updates.prompt = String(body.prompt).trim()
  if (body.description !== undefined) updates.description = body.description || null
  if (body.sort_order !== undefined || body.sortOrder !== undefined) {
    updates.sortOrder = Number(body.sort_order ?? body.sortOrder)
  }
  if (body.is_active !== undefined || body.isActive !== undefined) {
    const v = body.is_active ?? body.isActive
    updates.isActive = !(v === false || v === 0)
  }
  await db.update(schema.stylePresets).set(updates)
    .where(eq(schema.stylePresets.id, id))
  return success(c)
})

// DELETE /style-presets/:id — hapus keras (proyek yang sudah menggunakan gaya ini mempertahankan key, tidak berbahaya)
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.stylePresets).where(eq(schema.stylePresets.id, id))
  return success(c)
})

export default app
