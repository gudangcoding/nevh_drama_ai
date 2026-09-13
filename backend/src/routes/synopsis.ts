/**
 * Rute sinopsis — mengubah ide cerita mentah menjadi draft sinopsis terstruktur via Agent
 * POST /synopsis/generate   { idea, model?, config_id?, language? }
 * GET  /synopsis/drafts
 * DELETE /synopsis/drafts/:id
 */
import { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, badRequest, notFound, created, now } from '../utils/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { getUser, isAdmin } from '../services/ownership.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { mastra } from '../mastra/index.js'
import { logTaskError, logTaskProgress, logTaskStart } from '../utils/task-logger.js'
import { describeApiError } from '../utils/error-translate.js'

const app = new Hono()

function serializeDraft(row: typeof schema.synopsisDrafts.$inferSelect) {
  return {
    ...toSnakeCase(row),
    tags: row.tags ? JSON.parse(row.tags) : [],
  }
}

// POST /synopsis/generate — menghasilkan draft sinopsis dari ide
app.post('/generate', async (c) => {
  const body = await c.req.json()
  const idea = String(body.idea || '').trim()
  if (!idea) return badRequest(c, 'Ide cerita tidak boleh kosong')

  const user = getUser(c)
  const ts = now()
  const res = await db.insert(schema.synopsisDrafts).values({
    userId: user.id,
    idea,
    style: body.style || '3d',
    aspectRatio: body.aspect_ratio || '16:9',
    status: 'generating',
    createdAt: ts,
    updatedAt: ts,
  })
  const draftId = getInsertId(res)

  const requestContext = buildAgentRequestContext({
    episodeId: 0,
    dramaId: 0,
    userId: user.id,
    draftId,
    modelOverride: body.model || undefined,
    textConfigId: body.config_id || undefined,
    language: body.language || undefined,
  })

  logTaskStart('Agent', 'synopsis_generator', { draftId, userId: user.id })
  logTaskProgress('Agent', 'synopsis-idea', { draftId, idea: idea.slice(0, 300) })

  const agent = mastra.getAgent('synopsis_generator')
  if (!agent) {
    await db.update(schema.synopsisDrafts)
      .set({ status: 'failed', errorMsg: 'Agent synopsis_generator tidak ditemukan', updatedAt: now() })
      .where(eq(schema.synopsisDrafts.id, draftId))
    return badRequest(c, 'Agent synopsis_generator tidak ditemukan')
  }

  const startTime = performance.now()
  try {
    const result = await agent.generate(
      [{ role: 'user', content: idea }],
      { maxSteps: 20, requestContext },
    )
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    logTaskProgress('Agent', 'synopsis-done', { draftId, elapsedSeconds: elapsed })

    const [draft] = await db.select().from(schema.synopsisDrafts).where(eq(schema.synopsisDrafts.id, draftId))
    if (!draft) return notFound(c, 'Draft sinopsis tidak ditemukan')

    return created(c, {
      draft: serializeDraft(draft),
      text: result.text || '',
    })
  } catch (err: any) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    const message = describeApiError(err)
    logTaskError('Agent', 'synopsis_generator', { draftId, elapsedSeconds: elapsed, error: message })
    await db.update(schema.synopsisDrafts)
      .set({ status: 'failed', errorMsg: message, updatedAt: now() })
      .where(eq(schema.synopsisDrafts.id, draftId))
    return badRequest(c, message)
  }
})

// GET /synopsis/drafts — daftar draft milik user (admin melihat semua)
app.get('/drafts', async (c) => {
  const user = getUser(c)
  const rows = await db.select().from(schema.synopsisDrafts)
    .where(isAdmin(user) ? undefined : eq(schema.synopsisDrafts.userId, user.id))
    .orderBy(desc(schema.synopsisDrafts.updatedAt))
  return success(c, toSnakeCaseArray(rows).map((r: any) => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : [] })))
})

// DELETE /synopsis/drafts/:id — hapus draft
app.delete('/drafts/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const user = getUser(c)
  const [draft] = await db.select().from(schema.synopsisDrafts).where(eq(schema.synopsisDrafts.id, id))
  if (!draft || (!isAdmin(user) && draft.userId !== user.id)) return notFound(c, 'Draft tidak ditemukan')
  await db.delete(schema.synopsisDrafts).where(eq(schema.synopsisDrafts.id, id))
  return success(c)
})

export default app