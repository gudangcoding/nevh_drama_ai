import { Hono } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { mergeEpisodeVideos } from '../services/ffmpeg-merge.js'
import { toSnakeCase } from '../utils/transform.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// POST /episodes/:id/merge — gabungkan video shot (body.storyboard_ids opsional, hanya gabung yang dipilih)
app.post('/episodes/:id/merge', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  if (!ep) return badRequest(c, 'Episode tidak ditemukan')

  let storyboardIds: number[] | undefined
  let subtitles: boolean | undefined
  try {
    const body = await c.req.json()
    if (Array.isArray(body?.storyboard_ids)) {
      storyboardIds = body.storyboard_ids.map(Number).filter(Boolean)
    }
    if (typeof body?.subtitles === 'boolean') {
      subtitles = body.subtitles
    }
  } catch { /* tanpa body, gabungkan semua */ }

  try {
    logTaskStart('MergeAPI', 'episode-merge', { episodeId, dramaId: ep.dramaId, storyboardIds, subtitles })
    const mergeId = await mergeEpisodeVideos(episodeId, ep.dramaId, storyboardIds, { subtitles })
    logTaskSuccess('MergeAPI', 'episode-merge', { episodeId, mergeId })
    return success(c, { merge_id: mergeId, status: 'processing' })
  } catch (err: any) {
    logTaskError('MergeAPI', 'episode-merge', { episodeId, error: err.message })
    return badRequest(c, err.message)
  }
})

// GET /episodes/:id/merge — periksa status penggabungan terbaru
app.get('/episodes/:id/merge', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const merges = await db.select().from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, episodeId))


  const latest = merges[merges.length - 1]
  if (!latest) return success(c, null)

  return success(c, toSnakeCase(latest))
})

// GET /episodes/:id/merges — daftar film ( semua catatan penggabungan, yang baru di depan)
app.get('/episodes/:id/merges', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const merges = await db.select().from(schema.videoMerges)
    .where(and(eq(schema.videoMerges.episodeId, episodeId), isNull(schema.videoMerges.deletedAt)))
  merges.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return success(c, merges.slice(0, 30).map(toSnakeCase))
})

export default app
