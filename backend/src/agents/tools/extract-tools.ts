/**
 * Tool Agent Ekstrak Karakter/Adegan
 * Singleton tingkat modul — episodeId + dramaId disuntikkan per permintaan melalui RequestContext
 *
 * Alur satu langkah untuk satu Agent:
 * 1. Membaca konten scenario
 * 2. Membaca karakter/adegan yang sudah ada dalam proyek (untuk deduplikasi)
 * 3. Mengekstrak karakter/adegan dan menyimpan langsung dengan deduplikasi cerdas
 */
import { createTool } from '@mastra/core/tools'
import type { ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import { db, getInsertId, schema } from '../../db/index.js'
import { eq, and } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { logTaskProgress, logTaskSuccess } from '../../utils/task-logger.js'
import { getDramaId, getEpisodeId } from '../context.js'

// ─── Bantuan Penghubung ────────────────────────────────────────────────
async function linkCharToEpisode(episodeId: number, characterId: number) {
  const ts = now()
  const existing = await db.select().from(schema.episodeCharacters)
    .where(and(eq(schema.episodeCharacters.episodeId, episodeId), eq(schema.episodeCharacters.characterId, characterId)))

  if (!existing.length) {
    await db.insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt: ts })
  }
}

async function linkSceneToEpisode(episodeId: number, sceneId: number) {
  const ts = now()
  const existing = await db.select().from(schema.episodeScenes)
    .where(and(eq(schema.episodeScenes.episodeId, episodeId), eq(schema.episodeScenes.sceneId, sceneId)))

  if (!existing.length) {
    await db.insert(schema.episodeScenes).values({ episodeId, sceneId, createdAt: ts })
  }
}

async function linkPropToEpisode(episodeId: number, propId: number) {
  const ts = now()
  const existing = await db.select().from(schema.episodeProps)
    .where(and(eq(schema.episodeProps.episodeId, episodeId), eq(schema.episodeProps.propId, propId)))

  if (!existing.length) {
    await db.insert(schema.episodeProps).values({ episodeId, propId, createdAt: ts })
  }
}

// ─── Normalisasi Nama (Deduplikasi Nama Mirip) ───────────────────────────────────
// Saat ekstraksi, karakter/prop yang sama mungkin muncul dalam bentuk penulisan berbeda (misalnya "林小雨" dan "林小雨（主角）",
// "林小雨(女主)", "林小雨 "). Setelah dinormalisasi, dilakukan perbandingan tepat, jika cocok maka menggunakan yang sudah ada, tidak membuat duplikat.
function normalizeName(name: string): string {
  return (name || '')
    .replace(/[（(][^（()）]*[）)]/g, '') // Menghapus isi kurung Tiongkok/Inggris yang berpasangan (posisi karakter/alias)
    .replace(/[（(].*$/, '')              // Cadangan: memotong dari kurung pertama jika tidak tertutup
    .replace(/[\s　]+/g, '')          // Menghapus spasi dan spasi full-width
    .toLowerCase()
    .trim()
}

// Lokasi adegan hanya dinormalisasi spasi (tidak menghapus kurung: misalnya "火车站（候车厅）" dan "火车站（站台）" adalah adegan berbeda)
function normalizeLocation(loc: string): string {
  return (loc || '').replace(/[\s　]+/g, '').toLowerCase().trim()
}

type ToolContext = ToolExecutionContext | undefined

function requireIds(context: ToolContext): { episodeId: number; dramaId: number } | { error: string } {
  const episodeId = getEpisodeId(context?.requestContext)
  const dramaId = getDramaId(context?.requestContext)
  if (!episodeId || !dramaId) return { error: 'Missing episodeId/dramaId in request context' }
  return { episodeId, dramaId }
}

// 1. Membaca konten scenario
const readScriptForExtraction = createTool({
  id: 'read_script_for_extraction',
  description: 'Read the formatted screenplay for character/scene extraction.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId, dramaId } = ids
    const [ep] = await db.select().from(schema.episodes)
      .where(eq(schema.episodes.id, episodeId))
    if (!ep) return { error: 'Episode not found' }
    const content = ep.scriptContent || ep.content
    if (!content) return { error: 'Episode has no script content' }
    logTaskSuccess('ExtractTool', 'read-script', { episodeId, dramaId, scriptLength: content.length })
    return { script: content }
  },
})

// 2. Membaca karakter yang sudah ada dalam proyek (untuk penilaian deduplikasi)
const readExistingCharacters = createTool({
  id: 'read_existing_characters',
  description: 'Read all characters already existing in this drama project (for deduplication).',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId, dramaId } = ids
    const links = await db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId))
    const linkedIds = new Set(links.map(link => link.characterId))
    const chars = (await db.select().from(schema.characters)
      .where(eq(schema.characters.dramaId, dramaId)))
      .filter(c => !c.deletedAt)
    const visibleChars = chars.map(c => ({
      id: c.id,
      name: c.name,
      role: c.role || '',
      appearance: c.appearance || '',
      styling: c.styling || '',
      normalized_name: normalizeName(c.name), // Untuk menentukan penggunaan nama mirip: kurung posisi/alias dianggap sebagai nama yang sama
    }))
    const payload = {
      count: visibleChars.length,
      characters: visibleChars,
      current_episode_characters: visibleChars.filter(c => linkedIds.has(c.id)),
    }
    logTaskSuccess('ExtractTool', 'read-characters', {
      episodeId,
      dramaId,
      projectCharacters: payload.count,
      episodeCharacters: payload.current_episode_characters.length,
    })
    return payload
  },
})

// 3. Membaca adegan yang sudah ada dalam proyek (untuk penilaian deduplikasi)
const readExistingScenes = createTool({
  id: 'read_existing_scenes',
  description: 'Read all scenes already existing in this drama project (for deduplication).',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId, dramaId } = ids
    const links = await db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId))
    const linkedIds = new Set(links.map(link => link.sceneId))
    const scenes = (await db.select().from(schema.scenes)
      .where(eq(schema.scenes.dramaId, dramaId)))
      .filter(s => !s.deletedAt)
    const visibleScenes = scenes.map(s => ({
      id: s.id,
      location: s.location,
      time: s.time || '',
      prompt: s.prompt || '',
      lighting: s.lighting || '',
      normalized_location: normalizeLocation(s.location), // Untuk menentukan penggunaan nama mirip (hanya spasi/huruf besar-kecil)
    }))
    const payload = {
      count: visibleScenes.length,
      scenes: visibleScenes,
      current_episode_scenes: visibleScenes.filter(s => linkedIds.has(s.id)),
    }
    logTaskSuccess('ExtractTool', 'read-scenes', {
      episodeId,
      dramaId,
      projectScenes: payload.count,
      episodeScenes: payload.current_episode_scenes.length,
    })
    return payload
  },
})

// 4. Menyimpan karakter secara cerdas (deduplikasi berdasarkan nama, menggabungkan dengan data yang ada)
const saveDedupCharacters = createTool({
  id: 'save_dedup_characters',
  description: 'Save extracted characters with deduplication. Existing characters (same name) are merged/updated; new ones are created. All are linked to the current episode.',
  inputSchema: z.object({
    characters: z.array(z.object({
      name: z.string(),
      role: z.string().optional(),
      description: z.string().optional(),
      appearance: z.string().optional(),
      styling: z.string().optional(),
    })),
  }),
  execute: async ({ characters }, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId, dramaId } = ids
    const ts = now()
    const results = { created: 0, merged: 0 }
    logTaskProgress('ExtractTool', 'save-characters-begin', {
      episodeId,
      dramaId,
      names: characters.map(char => char.name).join(','),
    })

    for (const char of characters) {
      const charsInProject = (await db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)))
        .filter(c => !c.deletedAt)
      const exact = charsInProject.find(c => c.name === char.name)
      const normName = normalizeName(char.name)
      const existing = exact || (normName ? charsInProject.find(c => c.name && normalizeName(c.name) === normName) : undefined)
      const matchedViaNorm = !!existing && existing !== exact

      if (existing) {
        // Normalisasi cocok: nama mirip seperti kurung posisi/alias dianggap sebagai karakter yang sama untuk digunakan kembali, menghindari pembuatan duplikat
        if (matchedViaNorm) logTaskProgress('ExtractTool', 'save-characters-reuse', { episodeId, dramaId, extracted: char.name, reused: existing.name })
        // Sudah ada: menggabungkan informasi, mempertahankan ID
        await db.update(schema.characters).set({
          role: char.role || existing.role,
          description: char.description || existing.description,
          appearance: char.appearance || existing.appearance,
          styling: char.styling || char.description || existing.styling,
          updatedAt: ts,
        }).where(eq(schema.characters.id, existing.id))
        await linkCharToEpisode(episodeId, existing.id)
        results.merged++
      } else {
        // Karakter baru
        const res = await db.insert(schema.characters).values({
          name: char.name,
          role: char.role || '',
          description: char.description || '',
          appearance: char.appearance || '',
          styling: char.styling || char.description || '',
          dramaId,
          createdAt: ts,
          updatedAt: ts,
        })
        const charId = getInsertId(res)
        await linkCharToEpisode(episodeId, charId)
        results.created++
      }
    }

    const payload = {
      message: `角色保存完成：新增 ${results.created}，合并更新 ${results.merged}`,
      ...results,
    }
    logTaskSuccess('ExtractTool', 'save-characters-complete', { episodeId, ...results })
    return payload
  },
})

// 5. Menyimpan adegan secara cerdas (deduplikasi berdasarkan lokasi+waktu, menggabungkan dengan data yang ada)
const saveDedupScenes = createTool({
  id: 'save_dedup_scenes',
  description: 'Save extracted scenes with deduplication. Existing scenes (same location+time) are reused; new ones are created. All are linked to the current episode.',
  inputSchema: z.object({
    scenes: z.array(z.object({
      location: z.string(),
      time: z.string().optional(),
      prompt: z.string().optional(),
      description: z.string().optional(),
      lighting: z.string().optional(),
    })),
  }),
  execute: async ({ scenes }, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId, dramaId } = ids
    const ts = now()
    const results = { created: 0, reused: 0 }
    logTaskProgress('ExtractTool', 'save-scenes-begin', {
      episodeId,
      dramaId,
      scenes: scenes.map(scene => `${scene.location}@${scene.time || ''}`).join(','),
    })

    for (const scene of scenes) {
      // Pencocokan tepat berdasarkan lokasi+waktu; lokasi hanya dinormalisasi spasi/huruf besar-kecil (tidak menghapus kurung, menghindari penggabungan yang salah)
      const scenesInProject = (await db.select().from(schema.scenes)
        .where(eq(schema.scenes.dramaId, dramaId)))
        .filter(s => !s.deletedAt)
      const normLocation = normalizeLocation(scene.location)
      const existing = scenesInProject.find(s => s.location === scene.location && s.time === (scene.time || ''))
        || (normLocation ? scenesInProject.find(s => normalizeLocation(s.location) === normLocation && s.time === (scene.time || '')) : undefined)

      if (existing) {
        // Adegan dengan pencocokan lengkap sudah ada: menghubungkan dan melengkapi deskripsi/pencahayaan
        await db.update(schema.scenes).set({
          prompt: scene.prompt || scene.description || existing.prompt,
          lighting: scene.lighting || existing.lighting,
          updatedAt: ts,
        }).where(eq(schema.scenes.id, existing.id))
        await linkSceneToEpisode(episodeId, existing.id)
        results.reused++
      } else {
        const res = await db.insert(schema.scenes).values({
          dramaId,
          location: scene.location,
          time: scene.time || '',
          prompt: scene.prompt || scene.description || scene.location,
          lighting: scene.lighting || '',
          createdAt: ts,
          updatedAt: ts,
        })
        const sceneId = getInsertId(res)
        await linkSceneToEpisode(episodeId, sceneId)
        results.created++
      }
    }

    const payload = {
      message: `场景保存完成：新增 ${results.created}，复用已有 ${results.reused}`,
      ...results,
    }
    logTaskSuccess('ExtractTool', 'save-scenes-complete', { episodeId, ...results })
    return payload
  },
})

// 6. Membaca prop yang sudah ada dalam proyek (untuk penilaian deduplikasi)
const readExistingProps = createTool({
  id: 'read_existing_props',
  description: 'Read all props already existing in this drama project (for deduplication).',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId, dramaId } = ids
    const links = await db.select().from(schema.episodeProps)
      .where(eq(schema.episodeProps.episodeId, episodeId))
    const linkedIds = new Set(links.map(link => link.propId))
    const props = (await db.select().from(schema.props)
      .where(eq(schema.props.dramaId, dramaId)))
      .filter(p => !p.deletedAt)
    const visibleProps = props.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type || '',
      description: p.description || '',
      normalized_name: normalizeName(p.name), // Untuk menentukan penggunaan nama mirip: kurung posisi/alias dianggap sebagai nama yang sama
    }))
    const payload = {
      count: visibleProps.length,
      props: visibleProps,
      current_episode_props: visibleProps.filter(p => linkedIds.has(p.id)),
    }
    logTaskSuccess('ExtractTool', 'read-props', {
      episodeId,
      dramaId,
      projectProps: payload.count,
      episodeProps: payload.current_episode_props.length,
    })
    return payload
  },
})

// 7. Menyimpan prop secara cerdas (deduplikasi berdasarkan nama, menggabungkan dengan data yang ada)
const saveDedupProps = createTool({
  id: 'save_dedup_props',
  description: 'Save extracted props with deduplication. Existing props (same name) are merged/updated; new ones are created. All are linked to the current episode.',
  inputSchema: z.object({
    props: z.array(z.object({
      name: z.string(),
      type: z.string().optional(),
      description: z.string().optional(),
    })),
  }),
  execute: async ({ props }, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId, dramaId } = ids
    const ts = now()
    const results = { created: 0, merged: 0 }
    logTaskProgress('ExtractTool', 'save-props-begin', {
      episodeId,
      dramaId,
      names: props.map(prop => prop.name).join(','),
    })

    for (const prop of props) {
      const propsInProject = (await db.select().from(schema.props)
        .where(eq(schema.props.dramaId, dramaId)))
        .filter(p => !p.deletedAt)
      const exact = propsInProject.find(p => p.name === prop.name)
      const normName = normalizeName(prop.name)
      const existing = exact || (normName ? propsInProject.find(p => p.name && normalizeName(p.name) === normName) : undefined)
      const matchedViaNorm = !!existing && existing !== exact

      if (existing) {
        // Normalisasi cocok: nama mirip seperti kurung posisi/alias dianggap sebagai prop yang sama untuk digunakan kembali
        if (matchedViaNorm) logTaskProgress('ExtractTool', 'save-props-reuse', { episodeId, dramaId, extracted: prop.name, reused: existing.name })
        // Sudah ada: menggabungkan informasi, mempertahankan ID; prompt final lama menjadi tidak valid setelah penampilan objek berubah
        await db.update(schema.props).set({
          type: prop.type || existing.type,
          description: prop.description || existing.description,
          finalPrompt: prop.description ? null : existing.finalPrompt,
          updatedAt: ts,
        }).where(eq(schema.props.id, existing.id))
        await linkPropToEpisode(episodeId, existing.id)
        results.merged++
      } else {
        const res = await db.insert(schema.props).values({
          name: prop.name,
          type: prop.type || '',
          description: prop.description || '',
          dramaId,
          createdAt: ts,
          updatedAt: ts,
        })
        const propId = getInsertId(res)
        await linkPropToEpisode(episodeId, propId)
        results.created++
      }
    }

    const payload = {
      message: `道具保存完成：新增 ${results.created}，合并更新 ${results.merged}`,
      ...results,
    }
    logTaskSuccess('ExtractTool', 'save-props-complete', { episodeId, ...results })
    return payload
  },
})

export const extractTools = {
  readScriptForExtraction,
  readExistingCharacters,
  readExistingScenes,
  readExistingProps,
  saveDedupCharacters,
  saveDedupScenes,
  saveDedupProps,
}
