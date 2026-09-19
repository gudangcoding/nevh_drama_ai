/**
 * Tool Agent Edit Scenario
 * Singleton tingkat modul — episodeId disuntikkan per permintaan melalui RequestContext
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { and, eq, isNull } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { getDramaId, getEpisodeId } from '../context.js'

/**
 * Ekor skrip episode sebelumnya: agar penulisan ulang episode ini menyambung
 * (belajar dari episode sebelumnya + sinopsis), bukan mengulang kejadian yang
 * sudah selesai. 3000 char terakhir cukup untuk jangkar kontinuitas.
 */
async function readPreviousEpisodeTail(episodeId: number, dramaId: number | null) {
  if (!dramaId) return null
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  if (!ep) return null
  const prev = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
  const p = prev
    .filter(x => x.episodeNumber < ep.episodeNumber)
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .pop()
  if (!p) return null
  const script = String(p.scriptContent || p.content || '')
  if (!script.trim()) return null
  return {
    episode_number: p.episodeNumber,
    title: p.title || '',
    ending: script.slice(-3000),
  }
}

const readEpisodeScript = createTool({
  id: 'read_episode_script',
  description: 'Read the script content of the current episode, plus the previous episode ending (previous_episode) for continuity.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const episodeId = getEpisodeId(context?.requestContext)
    if (!episodeId) return { error: 'Missing episodeId in request context' }
    const [ep] = await db.select().from(schema.episodes)
      .where(eq(schema.episodes.id, episodeId))
    if (!ep) return { error: `Episode not found (id=${episodeId})` }
    const content = ep.content || ep.scriptContent
    if (!content) return { error: `Episode has no content (id=${episodeId})` }
    const dramaId = getDramaId(context?.requestContext)
    const previous_episode = await readPreviousEpisodeTail(episodeId, dramaId)
    return { content, word_count: content.length, episode_id: episodeId, previous_episode }
  },
})

const rewriteToScreenplay = createTool({
  id: 'rewrite_to_screenplay',
  description: 'Read the original content for AI rewriting. Returns the source text with formatting instructions.',
  inputSchema: z.object({
    instructions: z.string().optional().describe('Additional rewrite instructions'),
  }),
  execute: async ({ instructions }, context) => {
    const episodeId = getEpisodeId(context?.requestContext)
    if (!episodeId) return { error: 'Missing episodeId in request context' }
    const [ep] = await db.select().from(schema.episodes)
      .where(eq(schema.episodes.id, episodeId))
    if (!ep) return { error: `Episode not found` }
    const source = ep.content || ep.scriptContent
    if (!source) return { error: `Episode has no content to rewrite` }

    return {
      source_content: source,
      instruction: `Tulis ulang konten berikut menjadi skrip terformat.

Format skrip:
- Heading adegan: ## S<nomor> | INT/EXT · Lokasi | Periode waktu
- Deskripsi aksi: paragraf alami, tanpa bahasa kamera
- Dialog: NamaKarakter: (kondisi/ekspresi) isi dialog
- Setiap adegan mencakup konten 30-60 detik

${instructions || ''}

[Konten Asli]
${source}`,
    }
  },
})

const saveScript = createTool({
  id: 'save_script',
  description: 'Save the rewritten screenplay content to the current episode.',
  inputSchema: z.object({
    content: z.string().describe('The formatted screenplay content to save'),
  }),
  execute: async ({ content }, context) => {
    const episodeId = getEpisodeId(context?.requestContext)
    if (!episodeId) return { error: 'Missing episodeId in request context' }
    await db.update(schema.episodes)
      .set({ scriptContent: content, updatedAt: now() })
      .where(eq(schema.episodes.id, episodeId))

    return { message: `Script saved`, word_count: content.length }
  },
})

export const scriptTools = { readEpisodeScript, rewriteToScreenplay, saveScript }
