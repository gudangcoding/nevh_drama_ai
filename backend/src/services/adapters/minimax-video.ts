/**
 * Adapter pembuatan video MiniMax H3
 * Endpoint: POST /v2/video_generation -> { task_id }
 * Polling: GET  /v2/query/video_generation/{task_id} -> { task: { status, content.url, error } }
 *
 * Hanya mendukung model seri MiniMax-H3. Struktur multimodal content[]:
 * - text           Prompt (wajib, ≤7000 karakter)
 * - image_url      role: first_frame / last_frame / reference_image (gambar referensi ≤9)
 * - video_url      role: reference_video (≤3)
 * - audio_url      Audio referensi (≤3), total campuran ≤12
 *
 * Catatan:
 * - Untuk text-to-video ratio wajib dan tidak boleh adaptive; saat ada frame pertama (image-to-video) selalu adaptive, ratio dihilangkan
 * - H3 secara native menghasilkan audio dan video secara bersamaan, dokumentasi resmi tidak memiliki switch generate_audio terpisah, field ini diabaikan
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

/** Hanya mendukung seri MiniMax-H3 (pencocokan prefix, kompatibel dengan varian H3.x masa depan) */
const H3_MODEL_PREFIX = 'minimax-h3'
const DEFAULT_MODEL = 'MiniMax-H3'

/** Batas materi referensi multimodal: gambar 9, video 3, audio 3, total campuran 12 */
const REF_LIMITS = { images: 9, videos: 3, audios: 3, total: 12 } as const

const PROMPT_MAX_CHARS = 7000

/** Rasio aspek yang didukung MiniMax */
const VALID_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'])

function parseUrlArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u.trim()) : []
  } catch {
    return []
  }
}

export class MiniMaxVideoAdapter implements VideoProviderAdapter {
  provider = 'minimax'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || DEFAULT_MODEL
    if (!model.toLowerCase().startsWith(H3_MODEL_PREFIX)) {
      throw new Error(`Hanya mendukung model seri MiniMax H3 (MiniMax-H3*), saat ini: ${model}`)
    }

    const prompt = (record.prompt || '').trim()
    const refImages = parseUrlArray(record.referenceImageUrls)
    const refVideos = parseUrlArray(record.referenceVideoUrls)
    const refAudios = parseUrlArray(record.referenceAudioUrls)
    const firstFrame = (record.firstFrameUrl || record.imageUrl || '').trim()
    const lastFrame = (record.lastFrameUrl || '').trim()

    if (!prompt) throw new Error('MiniMax H3 mengharuskan adanya prompt (text content)')
    if (prompt.length > PROMPT_MAX_CHARS) {
      throw new Error(`Prompt terlalu panjang: MiniMax H3 batas ${PROMPT_MAX_CHARS} karakter, saat ini ${prompt.length}`)
    }

    const totalRefs = refImages.length + refVideos.length + refAudios.length + (firstFrame ? 1 : 0) + (lastFrame ? 1 : 0)
    if (refImages.length > REF_LIMITS.images || refVideos.length > REF_LIMITS.videos || refAudios.length > REF_LIMITS.audios || totalRefs > REF_LIMITS.total) {
      throw new Error(`Materi referensi melebihi batas: gambar≤${REF_LIMITS.images}, video≤${REF_LIMITS.videos}, audio≤${REF_LIMITS.audios}, total≤${REF_LIMITS.total}`)
    }

    const content: any[] = [{ type: 'text', text: prompt }]
    if (firstFrame) content.push({ type: 'image_url', image_url: { url: firstFrame }, role: 'first_frame' })
    if (lastFrame) content.push({ type: 'image_url', image_url: { url: lastFrame }, role: 'last_frame' })
    for (const url of refImages) {
      content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
    }
    for (const url of refVideos) {
      content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' })
    }
    for (const url of refAudios) {
      content.push({ type: 'audio_url', audio_url: { url } })
    }

    const body: any = {
      model,
      content,
      duration: this.normalizeDuration(record.duration),
      resolution: this.normalizeResolution(record.resolution),
    }

    // Image-to-video (ada frame pertama) ratio selalu adaptive, dihilangkan; text-to-video ratio wajib
    if (!firstFrame) {
      const ratio = (record.aspectRatio || '').trim()
      body.ratio = VALID_RATIOS.has(ratio) ? ratio : '16:9'
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v2', '/video_generation'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    if (result.task_id) {
      return { isAsync: true, taskId: String(result.task_id) }
    }
    const videoUrl = result.task?.content?.url || result.content?.url || result.video_url
    if (videoUrl) {
      return { isAsync: false, videoUrl }
    }
    throw new Error('No task_id or video url in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v2', `/query/video_generation/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    // Respons resmi adalah { task: { status, content: { url }, error } }, kompatibel dengan format top-level yang sudah ada
    const task = result.task && typeof result.task === 'object' ? result.task : result
    const status = task.status

    if (status === 'succeeded') {
      return {
        status: 'completed',
        videoUrl: task.content?.url || task.video_url,
      }
    }
    if (status === 'failed' || status === 'cancelled') {
      const err = task.error
      const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Video generation failed')
      const code = err && typeof err === 'object' && err.code ? `[${err.code}] ` : ''
      return { status: 'failed', error: `${code}${msg}` }
    }
    return { status: status || 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    const task = result.task && typeof result.task === 'object' ? result.task : result
    return task.content?.url || task.video_url || null
  }

  private normalizeDuration(duration?: number | null): number {
    const parsed = Math.round(Number(duration || 5))
    if (!Number.isFinite(parsed)) return 5
    // MiniMax H3 mendukung 4-15 detik
    return Math.min(15, Math.max(4, parsed))
  }

  /** MiniMax hanya memiliki dua opsi 768P / 2K; di sisi proyek 480p/720p dikonvergi ke 768P, 1080p/2K dikonvergi ke 2K */
  private normalizeResolution(resolution?: string | null): string {
    const r = (resolution || '').toLowerCase()
    if (r === '2k' || r === '1080p') return '2K'
    return '768P'
  }
}
