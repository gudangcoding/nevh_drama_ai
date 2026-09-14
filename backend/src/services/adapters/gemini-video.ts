/**
 * Adapter pembuatan video Google Gemini (Veo) melalui Google AI Studio / API developer
 *
 * Endpoint: POST /v1beta/models/{model}:predictLongRunning
 * (Model veo-* di API developer hanya mengumumkan supportedGenerationMethods=s["predictLongRunning"];
 *  alias lama :generateVideos sekarang 404.)
 * Respons awal: { name: "models/{model}/operations/xxx" } → polling GET /v1beta/models/{model}/operations/xxx
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
  'veo-3.1': { min: 4, max: 8 },
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
 * Mengurai data gambar referensi menjadi format Vertex/Gemini API untuk Veo (bytesBase64Encoded).
 * mendukung data URL, HTTP URL, atau path statis.
 */
function buildImageRef(url: string): { mimeType: string; bytesBase64Encoded?: string; uri?: string } | null {
  if (!url) return null
  const trimmed = url.trim()

  // data:image/jpeg;base64,xxxxx
  const b64Match = trimmed.match(/^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/i)
  if (b64Match) {
    const mime = b64Match[1].toLowerCase() === 'jpg' ? 'image/jpeg' : `image/${b64Match[1].toLowerCase()}`
    return { mimeType: mime, bytesBase64Encoded: b64Match[2] }
  }

  // HTTP/HTTPS URL → public URL (Veo menerima URL publik via uri)
  if (/^https?:\/\//.test(trimmed)) {
    return { mimeType: 'image/jpeg', uri: trimmed }
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

    // Bangun instance
    const instance: Record<string, any> = {}
    if (prompt) instance.prompt = prompt

    // First/last frame + referensi adalah jalur eksklusif per dokumen resmi Veo 3.1:
    //   - instance.image      → frame pertama (image-to-video)
    //   - instance.lastFrame  → frame terakhir (harus disertai image; tanpa wrapper image)
    //   - instance.referenceImages[].image → referensi (hanya saat image & lastFrame absen)
    if (firstFrame && lastFrame) {
      const firstImg = buildImageRef(firstFrame)
      const lastImg = buildImageRef(lastFrame)
      if (firstImg && firstImg.bytesBase64Encoded) instance.image = firstImg
      if (lastImg && lastImg.bytesBase64Encoded) instance.lastFrame = lastImg
    } else if (firstFrame) {
      const img = buildImageRef(firstFrame)
      if (img && img.bytesBase64Encoded) instance.image = img
    } else if (refImages.length > 0) {
      const images = refImages
        .map(buildImageRef)
        .filter((img): img is { mimeType: string; bytesBase64Encoded: string } => !!img && !!img.bytesBase64Encoded)
        .slice(0, REF_LIMITS.images)
      if (images.length > 0) {
        instance.referenceImages = images.map((image) => ({ referenceType: 'asset', image }))
      }
    }

    // Parameters: Vertex/Gemini API Veo
    const durationRange = getDurationRange(model)
    // Referensi/frame memaksa durasi 8 detik sesuai dokumen resmi
    const forced8s = Boolean(instance.referenceImages) || Boolean(instance.lastFrame)
    const duration = forced8s ? 8 : this.normalizeDuration(record.duration, durationRange)

    const parameters: Record<string, any> = {
      sampleCount: 1,
    }

    if (record.aspectRatio && VALID_RATIOS.has(record.aspectRatio)) parameters.aspectRatio = record.aspectRatio
    if (duration) parameters.durationSeconds = duration
    if (record.resolution && VALID_RESOLUTIONS.has(record.resolution)) parameters.resolution = record.resolution
    if (record.seed != null && Number.isFinite(record.seed)) {
      const seed = Math.round(record.seed)
      if (seed >= 0) parameters.seed = seed % 4_294_967_296
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
    // Respons predictLongRunning Gemini/Vertex: { name: "models/{model}/operations/xxx" } atau
    // "projects/{proj}/locations/{loc}/publishers/google/models/{model}/operations/xxx"
    const fullName = result.name || result.operationName
    if (typeof fullName === 'string' && fullName.includes('/operations/')) {
      return fullName
    }
    // Alias lama: "operations/xxx" langsung
    if (typeof fullName === 'string' && fullName.startsWith('operations/')) {
      return fullName
    }
    return null
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    // taskId berisi "models/{model}/operations/xxx" (atau "operations/xxx" lama).
    // buildPollRequest dipanggil pollTask, ia menerima taskId penuh; cukup tempel.
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
    if (result.done === false || result.state === 'RUNNING') {
      return { status: 'processing' }
    }
    if (result.done === true || result.state === 'SUCCEEDED') {
      // Gemini API: { response: { generateVideoResponse: { generatedSamples: [{ video: { uri, bytes } }] } } }
      // Vertex:       { response: { generatedVideos: [{ video: { uri } }] } }
      const response = result.response || result
      const genResp = response.generateVideoResponse || response
      const samples = genResp.generatedSamples || genResp.generatedVideos || response.generatedVideos || response.generated_videos || []
      const firstSample = Array.isArray(samples) ? samples[0] : null
      if (firstSample) {
        const video = firstSample.video || firstSample
        const videoUrl = video.uri || video.url || video.videoUri || null
        if (videoUrl) {
          return { status: 'completed', videoUrl }
        }
        // video bytes base64 inline
        const b64 = video.videoBytes || video.video_bytes || video.bytesBase64Encoded || firstSample.bytesInlineData?.data
        if (b64) {
          return { status: 'completed', videoUrl: `data:video/mp4;base64,${b64}` }
        }
      }
      // Error dari response
      const error = result.error || response.error || response.errorMessage
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
    const genResp = response.generateVideoResponse || response
    const samples = genResp.generatedSamples || genResp.generatedVideos || response.generatedVideos || response.generated_videos || genResp.videos || []
    const firstSample = Array.isArray(samples) ? samples[0] : null
    if (!firstSample) return null
    const video = firstSample.video || firstSample
    return video.uri || video.url || video.videoUri || video.gcsUri || null
  }

  private normalizeDuration(duration?: number | null, range = { min: 2, max: 8 }): number {
    const parsed = Math.round(Number(duration || range.max))
    if (!Number.isFinite(parsed)) return range.max
    return Math.min(range.max, Math.max(range.min, parsed))
  }
}
