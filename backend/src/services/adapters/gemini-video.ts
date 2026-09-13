/**
 * Adapter pembuatan video Google Gemini (Veo) melalui Google AI Studio / API developer
 *
 * Endpoint: POST /v1beta/models/{model}:predictLongRunning
 * (Model veo-* di API developer hanya mengumumkan supportedGenerationMethods=s["predictLongRunning"];
 *  alias lama :generateVideos sekarang 404.)
 * Respons awal: { operations: "operations/xxx" } → polling GET /v1beta/operations/xxx
 *
 * Mendukung model Veo:
 * - veo-3.1-generate-preview   (Veo 3.1)
 * - veo-3.0-generate-preview   (Veo 3.0)
 * - veo-3.0-fast-generate-preview (Veo 3.0 Fast)
 * - veo-2.0-generate-001       (Veo 2.0, deprecated)
 *
 * Fitur:
 * - Text-to-video (prompt saja)
 * - Image-to-video (single reference image)
 * - First/last frame control (Veo 3.1)
 * - Reference images (Veo 3.1, max 3)
 * - Native audio generation
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

const VEO_MODEL_PREFIX = 'veo-'
const DEFAULT_MODEL = 'veo-3.1-generate-preview'

/** Batas referensi: gambar 3, ekstensi 1 */
const REF_LIMITS = { images: 3 } as const

/** Durasi didukung per model */
const DURATION_MAP: Record<string, { min: number; max: number }> = {
  'veo-3.1': { min: 2, max: 8 },
  'veo-3.0': { min: 4, max: 8 },
  'veo-2.0': { min: 5, max: 8 },
}

const VALID_RATIOS = new Set(['16:9', '9:16'])
const VALID_RESOLUTIONS = new Set(['720p', '1080p', '4k'])

function parseUrlArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u.trim()) : []
  } catch {
    return []
  }
}

/**
 * Mengurai data gambar referensi menjadi format yang dipahami Gemini API.
 * Mendukung data URL, HTTP URL, atau path statis.
 */
function buildImageRef(url: string): { gcsUri?: string; base64?: string; mimeType: string } | null {
  if (!url) return null
  const trimmed = url.trim()

  // data:image/jpeg;base64,xxxxx
  const b64Match = trimmed.match(/^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/i)
  if (b64Match) {
    const mime = b64Match[1].toLowerCase() === 'jpg' ? 'image/jpeg' : `image/${b64Match[1].toLowerCase()}`
    return { base64: b64Match[2], mimeType: mime }
  }

  // HTTP/HTTPS URL → kirim sebagai URI (Google AI Studio mendukung HTTP URL sebagai input)
  if (/^https?:\/\//.test(trimmed)) {
    const ext = trimmed.split('?')[0].split('.').pop()?.toLowerCase() || ''
    const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }
    return { gcsUri: trimmed, mimeType: mimeMap[ext] || 'image/jpeg' }
  }

  return null
}

function getDurationRange(model: string): { min: number; max: number } {
  const lower = model.toLowerCase()
  for (const [prefix, range] of Object.entries(DURATION_MAP)) {
    if (lower.includes(prefix)) return range
  }
  return { min: 2, max: 8 }
}

export class GeminiVideoAdapter implements VideoProviderAdapter {
  provider = 'gemini'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || DEFAULT_MODEL
    const prompt = (record.prompt || '').trim()
    const firstFrame = (record.firstFrameUrl || record.imageUrl || '').trim()
    const lastFrame = (record.lastFrameUrl || '').trim()
    const refImages = parseUrlArray(record.referenceImageUrls)

    if (!prompt && !firstFrame && !refImages.length) {
      throw new Error('Gemini Veo membutuhkan minimal prompt atau gambar referensi')
    }
    if (refImages.length > REF_LIMITS.images) {
      throw new Error(`Gemini Veo maksimal ${REF_LIMITS.images} gambar referensi`)
    }
    if (lastFrame && !firstFrame) {
      throw new Error('Gemini Veo frame terakhir harus dikirim bersamaan dengan frame pertama')
    }

    // Bangun instance
    const instance: Record<string, any> = {}
    if (prompt) instance.prompt = prompt

    // Image-to-video (single reference)
    if (firstFrame) {
      const img = buildImageRef(firstFrame)
      if (img) instance.image = img
    }

    // First/last frame (Veo 3.1)
    if (firstFrame && lastFrame) {
      const firstImg = buildImageRef(firstFrame)
      const lastImg = buildImageRef(lastFrame)
      if (firstImg) instance.firstFrame = firstImg
      if (lastImg) instance.lastFrame = lastImg
      delete instance.image // firstFrame/lastFrame menggantikan image
    }

    // Reference images (Veo 3.1, max 3)
    if (refImages.length > 0) {
      const images = refImages.map(buildImageRef).filter(Boolean)
      if (images.length > 0) instance.images = images
    }

    // Parameters
    const durationRange = getDurationRange(model)
    const duration = this.normalizeDuration(record.duration, durationRange)

    const parameters: Record<string, any> = {
      numberOfVideos: 1,
    }

    if (record.aspectRatio && VALID_RATIOS.has(record.aspectRatio)) {
      parameters.aspectRatio = record.aspectRatio
    }
    if (duration) parameters.durationSeconds = duration
    if (record.resolution && VALID_RESOLUTIONS.has(record.resolution)) {
      parameters.resolution = record.resolution
    }

    // Audio: Veo 3.x always generates audio; Veo 2.0 has optional audio
    const lower = model.toLowerCase()
    if (lower.includes('veo-2')) {
      parameters.generateAudio = record.generateAudio !== 0 && record.generateAudio !== false
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1beta', `/models/${model}:predictLongRunning`),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: {
        model: `models/${model}`,
        instances: [instance],
        parameters,
      },
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    // Operasi async: { name: "operations/xxx" } (alias lama) atau
    // { operations: "operations/xxx" | ["operations/xxx"] | [{ name: ... }] } (predictLongRunning)
    const op = this.extractOperationName(result)
    if (op) {
      return { isAsync: true, taskId: op }
    }
    // Sinkron (jarang terjadi untuk Veo, tapi kompatibel)
    const videoUrl = this.extractVideoUrl(result)
    if (videoUrl) {
      return { isAsync: false, videoUrl }
    }
    throw new Error('No operation name or video URL in Gemini response')
  }

  private extractOperationName(result: any): string | null {
    if (!result || typeof result !== 'object') return null
    if (typeof result.name === 'string' && result.name.startsWith('operations/')) {
      return result.name
    }
    const ops = result.operations
    if (typeof ops === 'string') return ops.startsWith('operations/') ? ops : null
    if (Array.isArray(ops) && ops.length > 0) {
      const first = ops[0]
      if (typeof first === 'string') return first.startsWith('operations/') ? first : null
      if (first && typeof first.name === 'string' && first.name.startsWith('operations/')) {
        return first.name
      }
    }
    if (ops && typeof ops.name === 'string' && ops.name.startsWith('operations/')) {
      return ops.name
    }
    return null
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    // taskId berisi "operations/xxx"
    return {
      url: joinProviderUrl(config.baseUrl, '/v1beta', `/${taskId}`),
      method: 'GET',
      headers: {
        'x-goog-api-key': config.apiKey,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    if (result.done === false) {
      return { status: 'processing' }
    }
    if (result.done === true) {
      const response = result.response || {}
      const generatedVideos = response.generatedVideos || response.generated_videos || []
      const firstVideo = generatedVideos[0]
      if (firstVideo) {
        const video = firstVideo.video || firstVideo
        const videoUrl = video.uri || video.url || video.videoUri || null
        if (videoUrl) {
          return { status: 'completed', videoUrl }
        }
        // videoBytes (base64 inline)
        if (video.videoBytes || video.video_bytes) {
          return { status: 'completed', videoUrl: `data:video/mp4;base64,${video.videoBytes || video.video_bytes}` }
        }
      }
      // Error dari response
      const error = result.error || response.error
      if (error) {
        const msg = typeof error === 'string' ? error : (error.message || JSON.stringify(error))
        return { status: 'failed', error: msg }
      }
      return { status: 'failed', error: 'Video generation selesai tetapi tidak ada video dalam respons' }
    }
    // Status tidak diketahui
    return { status: 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    const response = result.response || result
    const generatedVideos = response.generatedVideos || response.generated_videos || []
    const firstVideo = generatedVideos[0]
    if (!firstVideo) return null
    const video = firstVideo.video || firstVideo
    return video.uri || video.url || video.videoUri || null
  }

  private normalizeDuration(duration?: number | null, range = { min: 2, max: 8 }): number {
    const parsed = Math.round(Number(duration || range.max))
    if (!Number.isFinite(parsed)) return range.max
    return Math.min(range.max, Math.max(range.min, parsed))
  }
}
