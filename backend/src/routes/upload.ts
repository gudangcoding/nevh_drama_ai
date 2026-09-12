import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { saveUploadedFile, generateImageThumb } from '../utils/storage.js'

const app = new Hono()

// POST /upload/image
app.post('/image', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return badRequest(c, 'File wajib diisi')
  }

  const buffer = await file.arrayBuffer()
  const path = await saveUploadedFile(buffer, 'uploads', file.name)
  // Sinkron generate thumbnail halaman daftar, gambar yang diunggah dan gambar yang dihasilkan menggunakan satu set pipeline tampilan (gagal tidak memengaruhi hasil unggahan)
  await generateImageThumb(path)
  return success(c, { url: `/${path}`, path })
})

const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v'])
const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'])
const VIDEO_MAX = 50 * 1024 * 1024 // 50MB

const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac'])
const AUDIO_MIME = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac'])
const AUDIO_MAX = 20 * 1024 * 1024 // 20MB

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

async function saveMediaUpload(
  c: any,
  kind: 'video' | 'audio',
  allowedExt: Set<string>,
  allowedMime: Set<string>,
  maxBytes: number,
) {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!file || !(file instanceof File)) {
    return badRequest(c, 'File wajib diisi')
  }
  const label = kind === 'video' ? 'video' : 'audio'
  const ext = extOf(file.name)
  // MIME bisa dipalsukan, ekstensi sebagai cadangan; kosong / octet-stream dianggap tidak dikenal, hanya validasi berdasarkan ekstensi
  const mimeKnown = file.type && file.type !== 'application/octet-stream'
  if (!allowedExt.has(ext) || (mimeKnown && !allowedMime.has(file.type))) {
    return badRequest(c, `Hanya file ${label} berformat ${Array.from(allowedExt).join('/')} yang didukung`)
  }
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength > maxBytes) {
    return badRequest(c, `Ukuran file ${label} tidak boleh melebihi ${Math.round(maxBytes / 1024 / 1024)}MB`)
  }
  const path = await saveUploadedFile(buffer, 'uploads', file.name)
  return success(c, { url: `/${path}`, path })
}

// POST /upload/video — Unggah video referensi (untuk referensi multimodal Seedance)
app.post('/video', async (c) => saveMediaUpload(c, 'video', VIDEO_EXT, VIDEO_MIME, VIDEO_MAX))

// POST /upload/audio — Unggah audio referensi (untuk referensi multimodal Seedance)
app.post('/audio', async (c) => saveMediaUpload(c, 'audio', AUDIO_EXT, AUDIO_MIME, AUDIO_MAX))

export default app
