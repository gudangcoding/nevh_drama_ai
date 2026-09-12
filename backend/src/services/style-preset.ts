/**
 * Layanan preset gaya — mengurai gaya visual yang terikat pada proyek menjadi potongan prompt bahasa Inggris
 * dramas.style menyimpan style_presets.value; mengembalikan string kosong jika tidak ditemukan/dinonaktifkan (pemanggil menggunakan fallback)
 */
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

/** Mencari potongan prompt bahasa Inggris preset gaya yang terikat pada proyek; mengembalikan '' jika tidak ditemukan */
export async function getDramaStylePrompt(dramaId: number | null | undefined): Promise<string> {
  if (!dramaId) return ''
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  if (!drama?.style) return ''
  const [preset] = await db.select().from(schema.stylePresets)
    .where(and(eq(schema.stylePresets.value, drama.style), eq(schema.stylePresets.isActive, true)))
  return preset?.prompt || ''
}
