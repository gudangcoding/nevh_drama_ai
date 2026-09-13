/**
 * Tool Agent synopsis_generator
 * Mengubah ide cerita (prompt bebas) menjadi sinopsis terstruktur sebuah proyek drama pendek
 * - read_synopsis_draft: membaca ide mentah + draft yang sudah tersimpan (jika ada)
 * - save_synopsis_draft: menulis hasil pengembangan (judul, genre, gaya, sinopsis, dll) ke baris draft
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { getDraftId, getUserId } from '../context.js'

const readSynopsisDraft = createTool({
  id: 'read_synopsis_draft',
  description: 'Read the raw idea and the currently saved draft (title, genre, style, synopsis etc.) for the ongoing synopsis generation request.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const draftId = getDraftId(context?.requestContext)
    if (!draftId) return { error: 'Missing draftId in request context' }
    const [draft] = await db.select().from(schema.synopsisDrafts).where(eq(schema.synopsisDrafts.id, draftId))
    if (!draft) return { error: 'Synopsis draft not found' }
    return {
      idea: draft.idea,
      saved: {
        title: draft.title || '',
        genre: draft.genre || '',
        style: draft.style || '',
        aspect_ratio: draft.aspectRatio || '16:9',
        synopsis: draft.synopsis || '',
        description: draft.description || '',
        tags: draft.tags ? JSON.parse(draft.tags) : [],
        cover_prompt: draft.coverPrompt || '',
      },
    }
  },
})

const saveSynopsisDraft = createTool({
  id: 'save_synopsis_draft',
  description: 'Save the structured synopsis derived from the idea: title, genre, style, aspect ratio, synopsis text, teaser description, tags, and an optional image cover prompt. This becomes the source for creating a new drama project.',
  inputSchema: z.object({
    title: z.string().describe('Short catchy drama title (Indonesian)'),
    genre: z.string().describe('Genre, e.g. drama, romance, horror'),
    style: z.string().describe('Visual style preset value, e.g. 3d, anime, indo_modern. Use 3d if unsure'),
    aspect_ratio: z.string().describe('Aspect ratio of the production, e.g. 16:9 or 9:16').default('16:9'),
    synopsis: z.string().describe('Complete multi-paragraph synopsis covering the whole short drama'),
    description: z.string().describe('Short teaser/description (2-4 sentences) used for project description and promotional copy'),
    tags: z.array(z.string()).describe('3-6 keyword hashtags/series tags, no leading #'),
    cover_prompt: z.string().describe('English image-generation prompt for the project cover poster, describing key characters and mood'),
  }),
  execute: async (input, context) => {
    const draftId = getDraftId(context?.requestContext)
    if (!draftId) return { error: 'Missing draftId in request context' }
    const userId = getUserId(context?.requestContext)
    const ts = now()

    const updates: Record<string, any> = {
      title: input.title || undefined,
      genre: input.genre || undefined,
      style: input.style || '3d',
      aspectRatio: input.aspect_ratio || '16:9',
      synopsis: input.synopsis || undefined,
      description: input.description || undefined,
      tags: Array.isArray(input.tags) ? JSON.stringify(input.tags) : undefined,
      coverPrompt: input.cover_prompt || undefined,
      status: 'completed',
      errorMsg: null,
      updatedAt: ts,
    }
    if (userId) updates.userId = userId

    await db.update(schema.synopsisDrafts).set(updates).where(eq(schema.synopsisDrafts.id, draftId))

    return {
      message: 'Synopsis draft saved',
      draft_id: draftId,
      title: input.title,
      word_count: String(input.synopsis || '').length,
    }
  },
})

export const synopsisTools = { readSynopsisDraft, saveSynopsisDraft }