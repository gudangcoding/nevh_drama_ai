/**
 * Adapter pembuatan video Alibaba Cloud Bailian Wan 3.0.
 *
 * Protokol resmi:
 * - POST /api/v1/services/aigc/video-generation/video-synthesis
 * - GET  /api/v1/tasks/{task_id}
 * - Hanya mendukung wan3.0-video-prime / wan3.0-video
 * - Body permintaan berupa { model, input: { prompt, media }, parameters }
 * - Respons asinkron berupa { output: { task_id, task_status }, request_id }
 */
import type {
  AIConfig,
  ProviderRequest,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
  VideoProviderAdapter,
} from './types'
import { joinProviderUrl } from './url'

const SUPPORTED_MODELS = new Set(['wan3.0-video-prime', 'wan3.0-video'])
const DEFAULT_MODEL = 'wan3.0-video-prime'
const PROMPT_MAX_CHARS = 20_000
const MAX_SEED = 2_147_483_647
const REF_LIMITS = { images: 10, videos: 5, audios: 5, total: 20 } as const
const VALID_RATIOS = new Set(['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'])
const VALID_RESOLUTIONS = new Set(['480P', '720P', '1080P'])

type WanMediaType =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'
  | 'file'
  | 'link'

interface WanMedia {
  type: WanMediaType
  url: string
}

function parseUrlArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value
      .filter((url): url is string => typeof url === 'string')
      .map(url => url.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function cleanUrl(value?: string | null): string {
  return String(value || '').trim()
}

function validateMediaUrl(type: WanMediaType, url: string) {
  const isWebUrl = /^https?:\/\//i.test(url)
  const isOssUrl = /^oss:\/\//i.test(url)
  const isImageData = /^data:image\/(?:jpeg|jpg|png|bmp|webp);base64,/i.test(url)
  if (type === 'first_frame' || type === 'last_frame' || type === 'reference_image') {
    if (isWebUrl || isOssUrl || isImageData) return
    throw new Error(`Wan 3.0 ${type} membutuhkan HTTP(S)/OSS gambar URL atau gambar Base64 yang didukung resmi`)
  }
  if (type === 'link') {
    if (isWebUrl) return
    throw new Error('Wan 3.0 link hanya mendukung halaman web publik HTTP(S) yang tidak memerlukan login')
  }
  if (isWebUrl || isOssUrl) return
  throw new Error(`Wan 3.0 ${type} hanya mendukung HTTP(S) atau OSS URL`)
}

function booleanValue(value: number | boolean | null | undefined, fallback: boolean): boolean {
  if (value === null || value === undefined) return fallback
  return value !== false && value !== 0
}

function errorMessage(result: any, fallback: string): string {
  const output = result?.output && typeof result.output === 'object' ? result.output : {}
  const code = output.code || result?.code
  const message = output.message || result?.message || fallback
  const requestId = result?.request_id
  return `${code ? `[${code}] ` : ''}${message}${requestId ? ` (request_id: ${requestId})` : ''}`
}

export class AliyunWanVideoAdapter implements VideoProviderAdapter {
  provider = 'aliyun'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = cleanUrl(record.model || config.model || DEFAULT_MODEL)
    if (!SUPPORTED_MODELS.has(model)) {
      throw new Error(`Wan 3.0 hanya mendukung wan3.0-video-prime atau wan3.0-video, saat ini: ${model}`)
    }

    // Secara otomatis memotong bagian yang melebihi 20000 karakter; sekaligus mengonversi penanda internal proyek @GambarN menjadi referensi resmi GambarN.
    const prompt = cleanUrl(record.prompt).replace(/@图片(\d+)/g, '图$1').slice(0, PROMPT_MAX_CHARS)

    const refImages = parseUrlArray(record.referenceImageUrls)
    const refVideos = parseUrlArray(record.referenceVideoUrls)
    const refAudios = parseUrlArray(record.referenceAudioUrls)
    const firstFrame = cleanUrl(record.firstFrameUrl || record.imageUrl)
    const lastFrame = cleanUrl(record.lastFrameUrl)
    const file = cleanUrl(record.referenceFileUrl)
    const link = cleanUrl(record.referenceLinkUrl)

    this.validateMedia({ refImages, refVideos, refAudios, firstFrame, lastFrame, file, link })

    const media: WanMedia[] = []
    if (firstFrame) media.push({ type: 'first_frame', url: firstFrame })
    if (lastFrame) media.push({ type: 'last_frame', url: lastFrame })
    for (const url of refImages) media.push({ type: 'reference_image', url })
    for (const url of refVideos) media.push({ type: 'reference_video', url })
    for (const url of refAudios) media.push({ type: 'reference_audio', url })
    if (file) media.push({ type: 'file', url: file })
    if (link) media.push({ type: 'link', url: link })
    for (const item of media) validateMediaUrl(item.type, item.url)

    if (!prompt && media.length === 0) {
      throw new Error('Wan 3.0 input.prompt dan input.media setidaknya harus menyediakan salah satu')
    }

    const input: { prompt?: string; media?: WanMedia[] } = {}
    if (prompt) input.prompt = prompt
    if (media.length) input.media = media

    const parameters: Record<string, string | number | boolean> = {
      resolution: this.normalizeResolution(record.resolution),
      ratio: this.normalizeRatio(record.aspectRatio),
      duration: this.normalizeDuration(record.duration),
      audio: booleanValue(record.generateAudio, true),
      prompt_extend: booleanValue(record.promptExtend, true),
      watermark: booleanValue(record.watermark, false),
    }

    if (record.seed !== null && record.seed !== undefined) {
      const seed = Number(record.seed)
      if (!Number.isInteger(seed) || (seed !== -1 && (seed < 0 || seed > MAX_SEED))) {
        throw new Error(`Wan 3.0 seed harus berupa bilangan bulat -1 atau 0~${MAX_SEED}`)
      }
      parameters.seed = seed
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/api/v1', '/services/aigc/video-generation/video-synthesis'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body: { model, input, parameters },
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    const taskId = result?.output?.task_id
    if (taskId) return { isAsync: true, taskId: String(taskId) }
    throw new Error(errorMessage(result, 'Wan 3.0 respons kekurangan output.task_id'))
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/api/v1', `/tasks/${encodeURIComponent(taskId)}`),
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const output = result?.output && typeof result.output === 'object' ? result.output : {}
    switch (output.task_status) {
      case 'PENDING':
        return { status: 'pending' }
      case 'RUNNING':
        return { status: 'processing' }
      case 'SUCCEEDED':
        if (!output.video_url) {
          return { status: 'failed', error: errorMessage(result, 'Wan 3.0 tugas berhasil tetapi respons kekurangan output.video_url') }
        }
        {
          const duration = Number(result?.usage?.output_video_duration ?? result?.usage?.duration)
          return {
            status: 'completed',
            videoUrl: output.video_url,
            ...(Number.isFinite(duration) ? { duration } : {}),
          }
        }
      case 'FAILED':
        return { status: 'failed', error: errorMessage(result, 'Wan 3.0 pembuatan video gagal') }
      case 'CANCELED':
        return { status: 'failed', error: errorMessage(result, 'Wan 3.0 tugas telah dibatalkan') }
      case 'UNKNOWN':
        return { status: 'failed', error: errorMessage(result, 'Wan 3.0 tugas tidak ada atau telah melewati batas waktu kueri 24 jam') }
      default:
        if (result?.code || result?.message || output.code || output.message) {
          return { status: 'failed', error: errorMessage(result, 'Wan 3.0 kueri tugas gagal') }
        }
        return { status: 'processing' }
    }
  }

  extractVideoUrl(result: any): string | null {
    return result?.output?.video_url || null
  }

  private validateMedia(input: {
    refImages: string[]
    refVideos: string[]
    refAudios: string[]
    firstFrame: string
    lastFrame: string
    file: string
    link: string
  }) {
    const { refImages, refVideos, refAudios, firstFrame, lastFrame, file, link } = input
    if (refImages.length > REF_LIMITS.images || refVideos.length > REF_LIMITS.videos || refAudios.length > REF_LIMITS.audios) {
      throw new Error(`Wan 3.0 materi referensi melebihi batas: gambar≤${REF_LIMITS.images}, video≤${REF_LIMITS.videos}, audio≤${REF_LIMITS.audios}`)
    }
    if (lastFrame && !firstFrame) throw new Error('Wan 3.0 frame terakhir harus dikirim bersamaan dengan frame pertama')
    if (file && link) throw new Error('Wan 3.0 file dan link tidak dapat dikirim secara bersamaan')

    const hasFrameMode = Boolean(firstFrame || lastFrame)
    const hasReferenceMode = Boolean(refImages.length || refVideos.length || refAudios.length || file || link)
    if (hasFrameMode && hasReferenceMode) {
      throw new Error('Wan 3.0 first_frame/last_frame tidak dapat digunakan bersamaan dengan reference_image/reference_video/reference_audio/file/link')
    }

    const total = refImages.length + refVideos.length + refAudios.length + (firstFrame ? 1 : 0)
      + (lastFrame ? 1 : 0) + (file ? 1 : 0) + (link ? 1 : 0)
    if (total > REF_LIMITS.total) throw new Error(`Wan 3.0 input.media maksimal ${REF_LIMITS.total} item`)
  }

  private normalizeDuration(duration?: number | null): number {
    if (duration === null || duration === undefined) return 5
    const value = Number(duration)
    if (!Number.isInteger(value) || (value !== -1 && (value < 2 || value > 30))) {
      throw new Error('Wan 3.0 duration harus berupa bilangan bulat -1 atau 2~30')
    }
    return value
  }

  private normalizeResolution(resolution?: string | null): string {
    const value = cleanUrl(resolution).toUpperCase() || '1080P'
    if (!VALID_RESOLUTIONS.has(value)) {
      throw new Error('Wan 3.0 resolution hanya mendukung 480P, 720P atau 1080P')
    }
    return value
  }

  private normalizeRatio(ratio?: string | null): string {
    const value = cleanUrl(ratio) || 'adaptive'
    if (!VALID_RATIOS.has(value)) {
      throw new Error('Wan 3.0 ratio hanya mendukung adaptive, 16:9, 4:3, 1:1, 3:4 atau 9:16')
    }
    return value
  }
}
