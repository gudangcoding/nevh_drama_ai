/**
 * Adapter pembuatan gambar Gemini
 * Autentikasi: parameter Query URL ?key= atau Header x-goog-api-key
 * Permintaan: struktur contents[].parts[] gaya Google REST
 * Respons: base64 dikodekan di inlineData.data, tanpa URL
 *
 * Model Image Gemini 3 (gemini-3.*-image) di host resmi memakai Interactions API (skema 2026-05-20):
 * POST /v1beta/interactions SINKRON (model image TIDAK mendukung background interactions),
 * respons akhir berisi status "completed" + gambaran di output_image / steps[].content[].type="image"
 * dengan data base64. response_format: { type:"image", mime_type:"image/jpeg", aspect_ratio, image_size }.
 */
import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url'
import { parseDataUrl } from '../../utils/storage.js'

export class GeminiImageAdapter implements ImageProviderAdapter {
  provider = 'gemini'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    // Format nama model Gemini: "models/gemini-3-pro-image" atau langsung "gemini-3-pro-image"
    const modelName = record.model || config.model || 'gemini-3-pro-image'
    // Endpoint interactions hanya tersedia untuk API resmi; relay station (jenis new-api) umumnya tidak mengkonfigurasi endpoint tipe ini,
    // akan muncul error "endpointType=GEMINI_INTERACTIONS tidak diaktifkan", endpoint tipe ini fallback ke branch generateContent
    const isGemini3Image = /gemini-3.*image/.test(modelName)
    const isOfficialHost = /generativelanguage\.googleapis\.com/.test(config.baseUrl || '')

    if (isGemini3Image && isOfficialHost) {
      // Model image tidak mendukung background interactions (pro-image menolak "background": true).
      // Jadi permintaan dikirim SINKRON: POST /v1beta/interactions menunggu sampai gambar selesai
      // (respons berisi status completed + output_image / steps[].content[].type=image, data base64).
      return {
        url: joinProviderUrl(config.baseUrl, '/v1beta', '/interactions'),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey,
        },
        body: {
          model: modelName.replace(/^models\//, ''),
          input: record.prompt || 'Generate an image',
          response_format: {
            type: 'image',
            mime_type: 'image/jpeg',
            aspect_ratio: this.parseAspectRatio(record.size),
            image_size: this.parseImageSize(record.size),
          },
        },
      }
    }

    const model = modelName.startsWith('models/') ? modelName : `models/${modelName}`

    // Body permintaan gaya Google REST
    const parts: any[] = []
    if (record.referenceImages) {
      try {
        const refs = JSON.parse(record.referenceImages)
        for (const ref of refs) {
          const parsed = parseDataUrl(String(ref || ''))
          if (parsed) {
            parts.push({
              inline_data: {
                mime_type: parsed.mimeType,
                data: parsed.data,
              },
            })
          }
        }
      } catch {}
    }
    parts.push({ text: record.prompt || 'Generate an image' })

    const body = {
      contents: [{
        parts,
      }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          // Mengurai ukuran seperti "1920x1080" -> aspectRatio
          aspectRatio: this.parseAspectRatio(record.size),
          imageSize: this.parseImageSize(record.size),
        },
      },
    }

    const url = new URL(joinProviderUrl(config.baseUrl, '/v1beta', `/${model}:generateContent`))
    url.searchParams.set('key', config.apiKey)

    return {
      url: url.toString(),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    // Error eksplisit dari interactions endpoint (misal: saldo tidak cukup, model tidak valid)
    if (result?.error) {
      throw new Error(result.error.message || 'Gemini generation failed')
    }

    const firstCandidate = result?.candidates?.[0]
    const finishReason = firstCandidate?.finishReason || firstCandidate?.finish_reason
    const finishMessage = firstCandidate?.finishMessage || firstCandidate?.finish_message

    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
      throw new Error(finishMessage || `Gemini generation stopped: ${finishReason}`)
    }

    if (this.extractImageUrl(result)) {
      return { isAsync: false, imageUrl: this.extractImageUrl(result) || undefined }
    }

    if (this.extractImageBase64(result)) {
      return { isAsync: false, imageUrl: undefined }
    }

    // Respons latar belakang: { id, status: "in_progress"|"queued"|"completed"|"failed" }
    // Status completed + output_image sudah tertangani extractImageBase64 di atas.
    if (result?.id) {
      const status = String(result.status || '').toLowerCase()
      // Jika status sudah final tapi tidak ada gambar, lempar error
      if (status === 'failed') {
        throw new Error(result.error?.message || 'Gemini generation failed')
      }
      // completed tanpa gambar: anomali (biasanya tak terjadi), fallback ke polling yang akan timeout
      return { isAsync: true, taskId: result.task_id || result.id }
    }

    if (result.task_id) {
      return { isAsync: true, taskId: result.task_id }
    }

    throw new Error('No image data in Gemini response')
  }

  parsePollResponse(result: any): ImagePollResponse {
    const status = String(result?.status || '').toLowerCase()
    // Error eksplisit dari hulu (saldo habis, moderasi konten, dll) = status akhir
    if (result?.error || status === 'failed' || status === 'error') {
      const msg = result?.error?.message || result?.error || 'Gemini generation failed'
      return { status: 'failed', error: msg }
    }
    if (status === 'completed') {
      // Gambar diekstrak oleh generation.ts via extractImageBase64 setelah status completed
      return { status: 'completed' }
    }
    // in_progress / queued / processing / pending → masih berjalan
    return { status: 'processing' }
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    // Endpoint polling interaksi: GET /v1beta/interactions/{id}
    const url = new URL(joinProviderUrl(config.baseUrl, '/v1beta', `/interactions/${taskId}`))
    url.searchParams.set('key', config.apiKey)
    return {
      url: url.toString(),
      method: 'GET',
      headers: {
        'x-goog-api-key': config.apiKey,
        'Api-Revision': '2026-05-20',
      },
      body: undefined,
    }
  }

  extractImageUrl(result: any): string | null {
    return result?.data?.[0]?.url
      || result?.image_url
      || result?.url
      || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const b64 = result?.data?.[0]?.b64_json
    if (b64) {
      return { data: b64, mimeType: 'image/png' }
    }

    if (result?.output_image?.data) {
      return {
        data: result.output_image.data,
        mimeType: result.output_image.mime_type || result.output_image.mimeType || 'image/jpeg',
      }
    }

    // Struktur Interactions API (respons akhir sinkron):
    // steps[].content[] = blok { type:"image", mime_type, data } (base64).
    // Model image bisa menghasilkan beberapa blok gambar (thinking → model_output); ambil yang TERAKHIR.
    const steps = result?.steps || []
    let last: { data: string; mimeType: string } | null = null
    for (const step of steps) {
      const content = Array.isArray(step?.content) ? step.content : []
      for (const block of content) {
        if (block?.type === 'image' && block.data) {
          last = {
            data: block.data,
            mimeType: block.mime_type || block.mimeType || 'image/jpeg',
          }
        }
      }
    }
    if (last) return last

    // Bentuk lama / relay: candidates[].content.parts[].inline_data
    const parts = result.candidates?.[0]?.content?.parts || []
    for (const part of parts) {
      if (part.inlineData || part.inline_data) {
        const inline = part.inlineData || part.inline_data
        return {
          data: inline.data,
          mimeType: inline.mimeType || inline.mime_type || 'image/jpeg',
        }
      }
    }
    return null
  }

  private parseAspectRatio(size?: string | null): string {
    if (!size) return '16:9'
    const [w, h] = size.split('x').map(Number)
    if (!w || !h) return '16:9'
    const gcd = this.gcd(w, h)
    return `${w / gcd}:${h / gcd}`
  }

  private parseImageSize(size?: string | null): string {
    if (!size) return '1K'
    const [w] = size.split('x').map(Number)
    if (!w) return '1K'
    if (w >= 2048) return '4K'
    if (w >= 1024) return '2K'
    if (w >= 512) return '1K'
    return '512'
  }

  private gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b)
  }
}
