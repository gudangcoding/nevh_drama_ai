/**
 * Utilitas penyimpanan file — mengunduh file remote ke lokal
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'
import { STORAGE_ROOT } from './paths.js'

/**
 * Mengunduh file remote ke penyimpanan lokal
 */
export async function downloadFile(url: string, subDir: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  const ext = getExtFromUrl(url)
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)

  const buffer = Buffer.from(await resp.arrayBuffer())
  fs.writeFileSync(filePath, buffer)

  // Mengembalikan path relatif (untuk dikembalikan API ke frontend)
  return `static/${subDir}/${filename}`
}

/**
 * Menyimpan file yang diunggah
 */
export async function saveUploadedFile(data: ArrayBuffer, subDir: string, originalName: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  const ext = path.extname(originalName) || '.bin'
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  fs.writeFileSync(filePath, Buffer.from(data))
  return `static/${subDir}/${filename}`
}

function getExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = path.extname(pathname)
    if (ext && ext.length <= 5) return ext
  } catch {}
  return '.bin'
}

/**
 * Mendapatkan path absolut file lokal
 */
export function getAbsolutePath(relativePath: string): string {
  if (relativePath.startsWith('static/')) {
    return path.join(STORAGE_ROOT, '..', relativePath)
  }
  return path.join(STORAGE_ROOT, relativePath)
}

/**
 * Menyimpan data gambar berbasis Base64 ke penyimpanan lokal
 * Digunakan untuk vendor yang hanya mengembalikan data base64 seperti Gemini
 */
export async function saveBase64Image(base64Data: string, mimeType: string, subDir: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  // Menginferensikan ekstensi file dari mimeType
  const ext = mimeTypeToExt(mimeType)
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  const buffer = Buffer.from(base64Data, 'base64')
  fs.writeFileSync(filePath, buffer)

  return `static/${subDir}/${filename}`
}

/** Menurunkan path thumbnail dari path relatif gambar: static/images/x.png → static/images/x_thumb.webp */
export function thumbPathFor(relativePath: string): string {
  return relativePath.replace(/\.[^./]+$/, '_thumb.webp')
}

/**
 * Menghasilkan thumbnail untuk halaman daftar dari gambar yang sudah tersimpan (lebar 400 WebP, direktori yang sama dengan gambar asli).
 * Jika gagal (file rusak/format abnormal, dll) mengembalikan null, tidak memblokir alur utama.
 */
export async function generateImageThumb(relativePath: string): Promise<string | null> {
  try {
    const thumbRel = thumbPathFor(relativePath)
    await sharp(getAbsolutePath(relativePath))
      .rotate()
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(getAbsolutePath(thumbRel))
    return thumbRel
  } catch (err) {
    console.warn(`[storage] 缩略图生成失败 ${relativePath}:`, (err as Error).message)
    return null
  }
}

export function readImageAsDataUrl(relativePath: string): string {
  const filePath = getAbsolutePath(relativePath)
  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = extToMimeType(ext)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export async function readImageAsCompressedDataUrl(
  relativePath: string,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {},
): Promise<string> {
  return compressImageAsDataUrl(getAbsolutePath(relativePath), options)
}

/**
 * Mengunduh gambar remote dan mengompresi menjadi data URL (normalisasi gambar referensi remote, untuk vendor yang mengunggah multipart/base64)
 */
export async function fetchImageAsCompressedDataUrl(
  url: string,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {},
): Promise<string> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!resp.ok) throw new Error(`下载参考图失败: HTTP ${resp.status}`)
  return compressImageAsDataUrl(Buffer.from(await resp.arrayBuffer()), options)
}

/** Input sharp → kompresi JPEG data URL (path lokal dan unduhan remote berbagi pipeline kompresi yang sama) */
async function compressImageAsDataUrl(
  input: string | Buffer,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {},
): Promise<string> {
  const maxWidth = options.maxWidth ?? 768
  const maxHeight = options.maxHeight ?? 768
  const quality = options.quality ?? 68

  const resized = sharp(input).rotate().resize({
    width: maxWidth,
    height: maxHeight,
    fit: 'inside',
    withoutEnlargement: true,
  })
  const metadata = await resized.metadata()
  const output = metadata.hasAlpha
    ? await resized.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer()
    : await resized.jpeg({ quality, mozjpeg: true }).toBuffer()
  const mimeType = 'image/jpeg'
  return `data:${mimeType};base64,${output.toString('base64')}`
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return {
    mimeType: match[1],
    data: match[2],
  }
}

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  }
  return map[mimeType] || '.bin'
}

function extToMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }
  return map[ext] || 'image/png'
}
