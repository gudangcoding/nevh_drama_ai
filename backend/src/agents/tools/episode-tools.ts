/**
 * Tool Agent episode_expander
 * Mengembangkan sinopsis drama menjadi N alur cerita episode (dipanggil satu per satu per episode)
 * - read_synopsis_context: membaca sinopsis drama + ringkasan episode yang sudah dibuat (kontinuitas)
 * - save_episode_content: menulis konten alur cerita episode saat ini (episodes.content)
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { and, eq, isNull } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { getDramaId, getEpisodeId } from '../context.js'

const readSynopsisContext = createTool({
  id: 'read_synopsis_context',
  description: 'Read the current episode number, the drama synopsis, all previously written episode stories (to keep continuity), and the visual style.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const episodeId = getEpisodeId(context?.requestContext)
    const dramaId = getDramaId(context?.requestContext)
    if (!episodeId || !dramaId) return { error: 'Missing episodeId or dramaId in request context' }
    const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
    const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
    if (!ep || !drama) return { error: 'Episode or drama not found' }

    const previous = await db.select().from(schema.episodes)
      .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    const prior = previous
      .filter(p => p.episodeNumber < ep.episodeNumber)
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
      // Ringkasan penuh per episode (bukan potongan 400 char): episode berikutnya
      // harus benar-benar "belajar" dari isi episode sebelumnya + sinopsis agar
      // cerita bersambung tanpa ada kejadian yang hilang/terulang.
      .map(p => ({
        episode_number: p.episodeNumber,
        title: p.title,
        summary: String(p.content || p.scriptContent || '').slice(0, 2000),
      }))

    return {
      episode_number: ep.episodeNumber,
      total_episodes: drama.totalEpisodes || 1,
      drama_title: drama.title,
      drama_style: drama.style,
      synopsis: drama.synopsis || drama.description || '',
      aspect_ratio: drama.aspectRatio,
      previous_episodes: prior,
    }
  },
})

const saveEpisodeContent = createTool({
  id: 'save_episode_content',
  description: 'Save the story outline content of the current episode. This becomes the raw source that will later be rewritten into a formatted screenplay.',
  inputSchema: z.object({
    title: z.string().describe('Short descriptive title for this episode'),
    content: z.string().describe('The full story outline content for this episode'),
  }),
  execute: async ({ title, content }, context) => {
    const episodeId = getEpisodeId(context?.requestContext)
    if (!episodeId) return { error: 'Missing episodeId in request context' }
    await db.update(schema.episodes)
      .set({ title: title || undefined, content, updatedAt: now() })
      .where(eq(schema.episodes.id, episodeId))
    return { message: 'Episode content saved', word_count: content.length }
  },
})

export const episodeTools = { readSynopsisContext, saveEpisodeContent }