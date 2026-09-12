/**
 * Analisis terpadu direktori data — satu-satunya anchor path di seluruh proyek
 *
 * dev: anchor ke repo root data/ (inferensi relatif __dirname, kedalaman src dan output tsc sama).
 * Versi desktop Electron: proses utama menyuntikkan HUOBAO_DATA_DIR ke direktori writable userData
 * (setelah packaging, inferensi relatif __dirname di dalam asar tidak tersedia, path tulis harus di luar paket).
 *
 * Semantics STORAGE_PATH tetap tidak berubah: hanya menimpa root penyimpanan static; jika HUOBAO_DATA_DIR
 * tidak disuntikkan, direktori induknya menjadi root data, memastikan perilaku getAbsolutePath('static/...') yang ada.
 */
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// src/utils → tiga level ke atas adalah repo root
const repoRoot = path.resolve(__dirname, '../../..')

export const DATA_ROOT = process.env.HUOBAO_DATA_DIR
  ?? (process.env.STORAGE_PATH
    ? path.dirname(path.resolve(process.env.STORAGE_PATH))
    : path.join(repoRoot, 'data'))

export const STORAGE_ROOT = process.env.STORAGE_PATH ?? path.join(DATA_ROOT, 'static')
