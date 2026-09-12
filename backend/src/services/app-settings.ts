/**
 * Pengaturan global tingkat aplikasi (tabel key-value app_settings)
 * Bahasa konten AI: bahasa target yang digunakan secara seragam untuk semua output Agent (naskah/ekstraksi/storyboard/prompt)
 * Batasan hierarki: modul ini hanya bergantung pada db, dilarang melakukan import balik agents/* (agents/context.ts akan mengacu ke modul ini)
 *
 * Catatan: sengaja dibuat sebagai API sinkron (drive .get()/.run() dari better-sqlite3),
 * agar buildAgentRequestContext sinkron di agents/context.ts dapat memanggil langsung
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'

export const CONTENT_LANGUAGES = ['zh', 'en', 'ja', 'ko', 'id'] as const
export type ContentLanguage = typeof CONTENT_LANGUAGES[number]

const CONTENT_LANGUAGE_KEY = 'content_language'

function isContentLanguage(v: unknown): v is ContentLanguage {
  return typeof v === 'string' && (CONTENT_LANGUAGES as readonly string[]).includes(v)
}

/** Membaca bahasa konten global; fallback ke 'zh' jika tidak disetel atau nilai tidak valid (mempertahankan perilaku default historis) */
export function getContentLanguage(): ContentLanguage {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, CONTENT_LANGUAGE_KEY))
    .get()
  return isContentLanguage(row?.value) ? row.value : 'zh'
}

/** Menulis bahasa konten global (upsert) */
export function setContentLanguage(lang: ContentLanguage): ContentLanguage {
  if (!isContentLanguage(lang)) throw new Error(`Invalid content language: ${lang}`)
  db.insert(schema.appSettings)
    .values({ key: CONTENT_LANGUAGE_KEY, value: lang, updatedAt: now() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: lang, updatedAt: now() },
    })
    .run()
  return lang
}
