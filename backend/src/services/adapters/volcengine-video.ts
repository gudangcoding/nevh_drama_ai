/**
 * Adapter pembuatan video Seedance 2.0 Volcano Engine
 * Endpoint: /api/v3/contents/generations/tasks (perhatikan prefix /api/v3)
 * Respons: { id: "task-xxx" } -> polling untuk mendapatkan status
 *
 * Hanya mendukung model seri Doubao Seedance 2.0+, mode pembuatan hanya mempertahankan referensi multimodal:
 * - reference   Referensi multimodal (≤9 reference_image + ≤3 reference_video + ≤3 reference_audio + teks opsional)
 *   Saat ada audio referensi harus menyertakan minimal 1 gambar atau video referensi
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl } from './url'

/** Hanya mendukung seri Seedance 2.0+ (pencocokan prefix, kompatibel dengan varian 2.0.x masa depan) */
const SEEDANCE2_MODEL_PREFIX = 'doubao-seedance-2-0'
const DEFAULT_MODEL = 'doubao-seedance-2-0-mini-260615'

/** Batas materi referensi multimodal: gambar 9, video 3, audio 3 */
const REF_LIMITS = { images: 9, videos: 3, audios: 3 } as const

function parseUrlArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u.trim()) : []
  } catch {
    return []
  }
}

export class VolcEngineVideoAdapter implements VideoProviderAdapter {
  provider = 'volcengine'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || DEFAULT_MODEL
    if (!model.startsWith(SEEDANCE2_MODEL_PREFIX)) {
      throw new Error(`Hanya mendukung model seri Seedance 2.0 (${SEEDANCE2_MODEL_PREFIX}-*), saat ini: ${model}`)
    }

    const prompt = (record.prompt || '').trim()
    const refImages = parseUrlArray(record.referenceImageUrls)
    const refVideos = parseUrlArray(record.referenceVideoUrls)
    const refAudios = parseUrlArray(record.referenceAudioUrls)

    if (refImages.length > REF_LIMITS.images || refVideos.length > REF_LIMITS.videos || refAudios.length > REF_LIMITS.audios) {
      throw new Error(`Materi referensi melebihi batas: gambar≤${REF_LIMITS.images}, video≤${REF_LIMITS.videos}, audio≤${REF_LIMITS.audios}`)
    }
    if (refAudios.length > 0 && refImages.length + refVideos.length === 0) {
      throw new Error('Audio referensi membutuhkan minimal 1 gambar atau video referensi')
    }
    if (!prompt && !refImages.length && !refVideos.length && !refAudios.length) {
      throw new Error('Mode referensi multimodal membutuhkan minimal satu materi referensi atau prompt')
    }

    const content: any[] = []
    if (prompt) content.push({ type: 'text', text: prompt })
    for (const url of refImages) {
      content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
    }
    for (const url of refVideos) {
      content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' })
    }
    for (const url of refAudios) {
      content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' })
    }

    const body: any = {
      model,
      content,
      generate_audio: record.generateAudio !== 0 && record.generateAudio !== false,
      ratio: record.aspectRatio || 'adaptive',
      duration: this.normalizeDuration(record.duration),
      // Seedance 2.0 hanya memiliki dua opsi 480p/720p, 1080p dikonvergi ke 720p
      resolution: record.resolution === '480p' ? '480p' : '720p',
      watermark: false,
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', '/contents/generations/tasks'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    if (result.id) {
      return { isAsync: true, taskId: result.id }
    }
    // Mengembalikan secara sinkron
    const videoUrl = result.video_url || result.content?.video_url || result.data?.video_url
    if (videoUrl) {
      return { isAsync: false, videoUrl }
    }
    throw new Error('No task_id or video_url in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', `/contents/generations/tasks/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const status = result.status
    if (status === 'succeeded') {
      const videoUrl = result.video_url || result.content?.video_url || result.data?.video_url
      return {
        status: 'completed',
        videoUrl,
      }
    }
    if (status === 'failed') {
      // Error dari hulu mungkin berupa objek { code, message } (seperti OutputVideoSensitiveContentDetected), dinormalisasi menjadi string
      const err = result.error
      const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Video generation failed')
      const code = err && typeof err === 'object' && err.code ? `[${err.code}] ` : ''
      return { status: 'failed', error: `${code}${msg}` }
    }
    return { status: status || 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    return result.video_url || result.content?.video_url || result.data?.video_url || null
  }

  private normalizeDuration(duration?: number | null): number {
    const parsed = Math.round(Number(duration || 5))
    if (!Number.isFinite(parsed)) return 5
    // Seedance 2.0 mendukung 4-15 detik
    return Math.min(15, Math.max(4, parsed))
  }
}
