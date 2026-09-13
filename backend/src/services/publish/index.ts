/**
 * Mesin publikasi sosial — SEO copy + orchestrasi job upload
 * 1. generateSeoCopy: meminta Agent publish_copier membuat judul/deskripsi/tag menarik
 * 2. runPublishJob: mengeksekusi job publish (upload) melalui adapter platform
 */
import { eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../../db/index.js'
import { now } from '../../utils/response.js'
import { mastra } from '../../mastra/index.js'
import { buildAgentRequestContext } from '../../agents/context.js'
import { getContentLanguage } from '../app-settings.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { agentAbortSignal } from '../../utils/agent-timeout.js'
import { generateWithRetry } from '../../utils/agent-retry.js'
import { getPublishAdapter } from './adapters.js'

export interface SeoCopy {
  title: string
  description: string
  tags: string[]
}

/** Parsing JSON dari teks LLM yang mungkin membungkus dengan ```json ... ``` */
function parseSeoJson(text: string): SeoCopy | null {
  if (!text) return null
  let raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) raw = fence[1].trim()
  const open = raw.indexOf('{')
  const close = raw.lastIndexOf('}')
  if (open >= 0 && close > open) raw = raw.slice(open, close + 1)
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        title: String(parsed.title || '').trim(),
        description: String(parsed.description || '').trim(),
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 10) : [],
      }
    }
  } catch { /* fallback null */ }
  return null
}

/** Menghasilkan judul/deskripsi/tag SEO untuk publikasi via Agent publish_copier */
export async function generateSeoCopy(opts: { dramaId: number; episodeId?: number }): Promise<SeoCopy> {
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, opts.dramaId))
  if (!drama) throw new Error('Drama tidak ditemukan')

  let episode: typeof schema.episodes.$inferSelect | null = null
  if (opts.episodeId) {
    const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, opts.episodeId))
    episode = ep || null
  }

  const prompt = [
    `Judul drama: ${drama.title || ''}`,
    `Genre: ${drama.genre || ''}`,
    `Sinopsis: ${String(drama.synopsis || drama.description || '').slice(0, 800)}`,
    episode ? `Episode: ${episode.title || ''} — ${String(episode.content || episode.scriptContent || episode.description || '').slice(0, 400)}` : '',
  ].filter(Boolean).join('\n')

  const requestContext = buildAgentRequestContext({
    episodeId: 0,
    dramaId: 0,
    language: getContentLanguage(),
  })

  logTaskStart('Publish', 'seo-copy', { dramaId: opts.dramaId, episodeId: opts.episodeId })

  const agent = mastra.getAgent('publish_copier')
  if (!agent) throw new Error('Agent publish_copier tidak ditemukan')
  const result = await generateWithRetry(agent, [{ role: 'user', content: prompt }], { maxSteps: 5, requestContext, abortSignal: agentAbortSignal(5) }, 'publish-seo', { episodeId: opts.episodeId })
  const seo = parseSeoJson(result.text || '')
  if (!seo || !seo.title) {
    // Fallback aman jika model tidak menghasilkan JSON valid
    return {
      title: episode?.title || drama.title || 'Video Drama Pendek',
      description: `Tonton ${drama.title} — ${String(drama.description || drama.synopsis || '').slice(0, 300)}`,
      tags: [drama.genre || 'drama', 'drama pendek', 'sinetron'],
    }
  }
  return seo
}

/** Membuat job publish dari episode yang sudah di-merge */
export async function createPublishJob(input: {
  userId: number
  dramaId: number
  episodeId: number
  accountId: number
  provider: string
  title?: string
  description?: string
  tags?: string[]
}): Promise<number> {
  const [episode] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, input.episodeId))
  if (!episode?.videoUrl) throw new Error('Episode belum memiliki video hasil gabungan (export)')
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, input.dramaId))
  const [account] = await db.select().from(schema.publishAccounts).where(eq(schema.publishAccounts.id, input.accountId))
  if (!account || account.provider !== input.provider) throw new Error('Akun platform belum terhubung')

  const ts = now()
  const res = await db.insert(schema.publishJobs).values({
    userId: input.userId,
    dramaId: input.dramaId,
    episodeId: input.episodeId,
    provider: input.provider,
    accountId: input.accountId,
    title: input.title || episode.title || drama?.title || 'Video Drama Pendek',
    description: input.description || '',
    tags: Array.isArray(input.tags) ? JSON.stringify(input.tags) : null,
    videoPath: episode.videoUrl,
    thumbnailPath: episode.thumbnail || drama?.thumbnail || null,
    status: 'pending',
    createdAt: ts,
    updatedAt: ts,
  })
  const jobId = getInsertId(res)
  void runPublishJob(jobId).catch(err => {
    logTaskError('Publish', 'job-run', { jobId, error: err.message })
  })
  return jobId
}

/** Menjalankan job publish: status uploading → upload via adapter → published/failed */
export async function runPublishJob(jobId: number): Promise<void> {
  const [job] = await db.select().from(schema.publishJobs).where(eq(schema.publishJobs.id, jobId))
  if (!job) throw new Error('Job publikasi tidak ditemukan')

  const [account] = await db.select().from(schema.publishAccounts).where(eq(schema.publishAccounts.id, job.accountId))
  if (!account?.accessToken) throw new Error('Akun platform belum memiliki token akses')

  await db.update(schema.publishJobs)
    .set({ status: 'uploading', updatedAt: now() })
    .where(eq(schema.publishJobs.id, jobId))

  logTaskStart('Publish', 'upload', { jobId, provider: job.provider, dramaId: job.dramaId, episodeId: job.episodeId })

  try {
    const adapter = getPublishAdapter(job.provider)
    const tags = job.tags ? JSON.parse(job.tags) : []
    const result = await adapter.upload({
      accessToken: account.accessToken,
      videoPath: job.videoPath || '',
      thumbnailPath: job.thumbnailPath || undefined,
      title: job.title || '',
      description: job.description || '',
      tags,
    })

    await db.update(schema.publishJobs)
      .set({
        status: 'published',
        platformVideoId: result.platformVideoId || null,
        platformUrl: result.platformUrl || null,
        completedAt: now(),
        updatedAt: now(),
        errorMsg: null,
      })
      .where(eq(schema.publishJobs.id, jobId))
    logTaskSuccess('Publish', 'upload-done', { jobId, platformUrl: result.platformUrl || null })
  } catch (err: any) {
    await db.update(schema.publishJobs)
      .set({ status: 'failed', errorMsg: err.message || 'Upload gagal', updatedAt: now() })
      .where(eq(schema.publishJobs.id, jobId))
    throw err
  }
}

export { getPublishAdapter }