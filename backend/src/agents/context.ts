/**
 * Konteks permintaan Agent — disuntikkan per permintaan melalui Mastra RequestContext
 * Lapisan route build → generate({ requestContext }) → dibaca di dalam execute tool
 */
import { RequestContext } from '@mastra/core/request-context'
import { getContentLanguage, type ContentLanguage } from '../services/app-settings.js'

export interface AgentRequestContextValues {
  episodeId: number
  dramaId: number
  modelOverride?: string
  textConfigId?: number
  /** Bahasa konten AI; jika tidak diatur, baca pengaturan global (app_settings.content_language) */
  language?: ContentLanguage
  /** ID pengguna pemilik permintaan (opsional, untuk draft yang belum terikat episode/drama) */
  userId?: number
  /** ID draft sinopsis (opsional, untuk Agent synopsis_generator) */
  draftId?: number
}

export function buildAgentRequestContext(values: AgentRequestContextValues): RequestContext<AgentRequestContextValues> {
  const rc = new RequestContext<AgentRequestContextValues>()
  rc.set('episodeId', values.episodeId)
  rc.set('dramaId', values.dramaId)
  if (values.modelOverride) rc.set('modelOverride', values.modelOverride)
  if (values.textConfigId) rc.set('textConfigId', values.textConfigId)
  if (values.userId) rc.set('userId', values.userId)
  if (values.draftId) rc.set('draftId', values.draftId)
  // Bahasa diurai secara terpusat di tempat pembangunan: 4 jalur (chat/ekstrak/prompt gambar/prompt video) semuanya melewati sini,
  // pengaturan global berlaku di satu tempat; values.language yang diberikan secara eksplisit dapat menimpa per permintaan
  rc.set('language', values.language ?? getContentLanguage())
  return rc
}

export function getEpisodeId(requestContext: RequestContext | undefined): number | null {
  const v = requestContext?.get('episodeId' as never)
  return typeof v === 'number' ? v : null
}

export function getDramaId(requestContext: RequestContext | undefined): number | null {
  const v = requestContext?.get('dramaId' as never)
  return typeof v === 'number' ? v : null
}

/** Membaca bahasa konten dari konteks permintaan; jika tidak diatur mengembalikan null (pemanggil memperlakukan sebagai zh) */
export function getContentLanguageFromRC(requestContext: RequestContext | undefined): ContentLanguage | null {
  const v = requestContext?.get('language' as never)
  return typeof v === 'string' && v ? (v as ContentLanguage) : null
}

/** Membaca ID pengguna dari konteks permintaan (opsional) */
export function getUserId(requestContext: RequestContext | undefined): number | null {
  const v = requestContext?.get('userId' as never)
  return typeof v === 'number' ? v : null
}

/** Membaca ID draft sinopsis dari konteks permintaan (opsional) */
export function getDraftId(requestContext: RequestContext | undefined): number | null {
  const v = requestContext?.get('draftId' as never)
  return typeof v === 'number' ? v : null
}
