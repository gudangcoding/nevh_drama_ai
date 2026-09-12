/**
 * Antarmuka Provider Adapter untuk Pembuatan Gambar
 */
export interface ImageProviderAdapter {
  /** Identifikasi penyedia */
  provider: string

  /**
   * Membangun permintaan pembuatan gambar
   * @param config Konfigurasi AI { baseUrl, apiKey, model }
   * @param record Catatan pembuatan gambar
   */
  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest

  /**
   * Mengurai respons pembuatan, menentukan apakah sinkron atau asinkron
   */
  parseGenerateResponse(result: any): ImageGenResponse

  /**
   * Membangun permintaan polling
   * @param config Konfigurasi AI
   * @param taskId ID Tugas
   */
  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest

  /**
   * Mengurai respons polling
   */
  parsePollResponse(result: any): ImagePollResponse

  /**
   * Mengekstrak URL gambar dari respons (untuk pengunduhan langsung)
   * Mengembalikan null berarti data gambar dalam format base64, perlu diproses dengan extractImageBase64
   */
  extractImageUrl(result: any): string | null

  /**
   * Mengekstrak data gambar base64 dari respons
   * Hanya untuk penyedia seperti Gemini yang hanya mengembalikan base64
   */
  extractImageBase64(result: any): { data: string; mimeType: string } | null
}

/**
 * Antarmuka Provider Adapter untuk Pembuatan Video
 */
export interface VideoProviderAdapter {
  provider: string

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest

  parseGenerateResponse(result: any): VideoGenResponse

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest

  parsePollResponse(result: any): VideoPollResponse

  extractVideoUrl(result: any): string | null
}

// ============ Tipe umum ============

export interface ProviderRequest {
  url: string
  method: string
  headers: Record<string, string>
  /**
   * Permintaan biasa adalah objek yang dapat diserialisasi JSON (generation.ts secara seragam JSON.stringify);
   * upload multipart (seperti OpenAI /v1/images/edits) langsung mengembalikan FormData,
   * dalam hal ini headers jangan setel Content-Type, batasannya dibuat secara otomatis oleh fetch.
   */
  body: any
}

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

export interface ImageGenerationRecord {
  id: number
  model?: string | null
  prompt?: string | null
  size?: string | null
  frameType?: string | null
  referenceImages?: string | null
  // ... field lainnya
}

export interface VideoGenerationRecord {
  id: number
  model?: string | null
  prompt?: string | null
  referenceMode?: string | null
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  referenceImageUrls?: string | null
  referenceVideoUrls?: string | null
  referenceAudioUrls?: string | null
  referenceFileUrl?: string | null
  referenceLinkUrl?: string | null
  generateAudio?: number | boolean | null
  duration?: number | null
  aspectRatio?: string | null
  resolution?: string | null
  seed?: number | null
  promptExtend?: number | boolean | null
  watermark?: number | boolean | null
  // ... field lainnya
}

export interface ImageGenResponse {
  isAsync: boolean
  taskId?: string
  /** URL gambar yang dikembalikan langsung dalam mode sinkron */
  imageUrl?: string
}

export interface ImagePollResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  imageUrl?: string
  error?: string
}

export interface VideoGenResponse {
  isAsync: boolean
  taskId?: string
  videoUrl?: string
}

export interface VideoPollResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  duration?: number
  error?: string
}
