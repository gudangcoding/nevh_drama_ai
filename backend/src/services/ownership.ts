import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { db, schema } from '../db/index.js'
import type { AuthUser } from '../services/auth.js'

type HttpError = { status: number; message: string }

export function httpError(status: number, message: string): HttpError {
  return { status, message }
}

/** Membaca user yang di-set oleh requireAuth; 401 jika belum terautentikasi */
export function getUser(c: Context): AuthUser {
  const user = (c.get as (key: string) => unknown)('user') as AuthUser | undefined
  if (!user) throw httpError(401, 'Silakan masuk terlebih dahulu')
  return user
}

export function isAdmin(user: AuthUser): boolean {
  return user.role === 'admin'
}

async function dramaOfDrama(dramaId: number) {
  const [d] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  return d || null
}

async function episodeOfDrama(episodeId: number) {
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  return ep || null
}

/** Mekanisme inti izin: admin boleh semua; user biasa hanya drama miliknya (drama tidak ada → 404 agar tidak membocorkan keberadaan) */
export async function assertDramaAccess(c: Context, dramaId: number): Promise<void> {
  const user = getUser(c)
  if (isAdmin(user)) return
  const drama = await dramaOfDrama(dramaId)
  if (!drama || drama.userId !== user.id) throw httpError(404, 'Drama tidak ditemukan')
}

export async function assertEpisodeAccess(c: Context, episodeId: number): Promise<void> {
  const ep = await episodeOfDrama(episodeId)
  if (!ep) throw httpError(404, 'Episode tidak ditemukan')
  await assertDramaAccess(c, ep.dramaId)
}

export async function assertStoryboardAccess(c: Context, storyboardId: number): Promise<void> {
  const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId))
  if (!sb) throw httpError(404, 'Storyboard tidak ditemukan')
  await assertEpisodeAccess(c, sb.episodeId)
}

export async function assertCharacterAccess(c: Context, characterId: number): Promise<void> {
  const [ch] = await db.select().from(schema.characters).where(eq(schema.characters.id, characterId))
  if (!ch) throw httpError(404, 'Karakter tidak ditemukan')
  await assertDramaAccess(c, ch.dramaId)
}

export async function assertSceneAccess(c: Context, sceneId: number): Promise<void> {
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId))
  if (!scene) throw httpError(404, 'Scene tidak ditemukan')
  await assertDramaAccess(c, scene.dramaId)
}

export async function assertPropAccess(c: Context, propId: number): Promise<void> {
  const [prop] = await db.select().from(schema.props).where(eq(schema.props.id, propId))
  if (!prop) throw httpError(404, 'Properti tidak ditemukan')
  await assertDramaAccess(c, prop.dramaId)
}

export async function assertTaskAccess(c: Context, taskId: number): Promise<void> {
  const [task] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, taskId))
  if (!task) throw httpError(404, 'Tugas tidak ditemukan')
  if (task.dramaId != null) return assertDramaAccess(c, task.dramaId)
  if (task.storyboardId != null) return assertStoryboardAccess(c, task.storyboardId)
  if (task.characterId != null) return assertCharacterAccess(c, task.characterId)
  if (task.sceneId != null) return assertSceneAccess(c, task.sceneId)
  // Tugas tanpa relasi drama: hanya dapat dilihat admin (tidak ada pemilik)
  const user = getUser(c)
  if (!isAdmin(user)) throw httpError(404, 'Tugas tidak ditemukan')
}

/**
 * Filter daftar sys_task berdasarkan kepemilikan:
 * admin melihat semua, user biasa hanya tugas yang bermuara pada drama miliknya.
 */
export async function filterTasksByOwnership(c: Context, rows: typeof schema.sysTask.$inferSelect[]): Promise<typeof schema.sysTask.$inferSelect[]> {
  const user = getUser(c)
  if (isAdmin(user)) return rows
  const ownedDramas = await db.select().from(schema.dramas).where(eq(schema.dramas.userId, user.id))
  const dramaIds = new Set(ownedDramas.map(d => d.id))

  const sbIds = new Set((rows.map(r => r.storyboardId) as (number | null)[]).filter((x): x is number => x != null))
  const chIds = new Set((rows.map(r => r.characterId) as (number | null)[]).filter((x): x is number => x != null))
  const scIds = new Set((rows.map(r => r.sceneId) as (number | null)[]).filter((x): x is number => x != null))

  const sbDrama = new Map<number, number>()
  const chDrama = new Map<number, number>()
  const scDrama = new Map<number, number>()
  for (const id of sbIds) {
    const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id))
    if (sb) {
      const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId))
      if (ep) sbDrama.set(id, ep.dramaId)
    }
  }
  for (const id of chIds) {
    const [ch] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
    if (ch) chDrama.set(id, ch.dramaId)
  }
  for (const id of scIds) {
    const [sc] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
    if (sc) scDrama.set(id, sc.dramaId)
  }

  return rows.filter((r) => {
    if (r.dramaId != null) return dramaIds.has(r.dramaId)
    if (r.storyboardId != null) return dramaIds.has(sbDrama.get(r.storyboardId) ?? -1)
    if (r.characterId != null) return dramaIds.has(chDrama.get(r.characterId) ?? -1)
    if (r.sceneId != null) return dramaIds.has(scDrama.get(r.sceneId) ?? -1)
    return false
  })
}