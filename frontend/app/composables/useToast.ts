/**
 * Titik masuk notifikasi kesalahan yang seragam — petakan kesalahan teknis mentah (Failed to fetch / API error 500: {...} /
 * kesalahan upstream / output ffmpeg / teks SDK dalam bahasa Inggris) ke dalam teks yang mudah dibaca oleh pengguna.
 *
 * - mapError(err, { fallback? }): kembalikan teks ramah pengguna ( tampilan inline menggunakan fungsi yang sama)
 * - toastError(err, { fallback?, duration? }): toast.error(mapError(...)), kesalahan seragam 5s
 * - pesan kesalahan pendek dalam bahasa asli dari backend (seperti "Episode tidak ditemukan") diteruskan apa adanya
 * - kesalahan asli tidak ditampilkan, debug melalui DevTools (useApi sudah console.error)
 */
import { toast } from 'vue-sonner'
import { i18n } from '~/composables/i18n'

const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params)

/** Ciri konten moderasi (dipindahkan dari episode.vue's videoModerationHint, digunakan di seluruh situs) */
export const MODERATION_RE = /sensitive|moderation|real[\s_-]?person|content[\s_-]?policy|risk[\s_-]?control|violation|blocked|content.*(violat|non.?compliant|rejected|failed)|konten.*(ditolak|gagal|tidak lolos)/i

const NETWORK_RE = /failed to fetch|network ?error|load failed|network request failed|fetch failed/i
const NONJSON_RE = /unexpected token|not valid json|failed to parse/i
const SERVER5XX_RE = /(^|\D)5\d{2}(\D|$)|internal server error|kesalahan server internal/i
const AUTH_RE = /(^|\D)40[13](\D|$)|unauthorized|forbidden|invalid[\s_-]?api[\s_-]?key|authentication|autentikasi/i
const RATELIMIT_RE = /(^|\D)429(\D|$)|rate[\s_-]?limit|too many requests|quota|kuota tidak cukup|insufficient/i
const TIMEOUT_RE = /timeout|timed out|polling exceeded|waktu habis/i
/** Ciri teknis: muncul berarti tidak dapat diteruskan langsung ke pengguna */
const TECHY_RE = /[{}\[\]<>]|https?:\/\/|\b(error|errno|exception|code|stack|undefined|null)\b|[a-z]+_[a-z]+/i
/** Ciri teks ramah pengguna: mengandung bahasa alami (Cina/Jepang/Korea/Latin), dianggap dapat dibaca oleh pengguna */
const NATURAL_LANG_RE = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7afa-zA-Z]/

function messageOf(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message || String(err)
  const anyErr = err as { message?: unknown; error_msg?: unknown; errorMsg?: unknown }
  return String(anyErr.message ?? anyErr.error_msg ?? anyErr.errorMsg ?? err)
}

/**
 * Error → teks ramah pengguna. Klasifikasi sesuai prioritas short-circuit:
 * Jaringan → non-JSON → moderasi → otentikasi → batasrate → 5xx → timeout → transparansi pesan pendek → kode status → fallback
 */
export function mapError(err: unknown, opts?: { fallback?: string }): string {
  const msg = messageOf(err).trim()
  if (!msg) return opts?.fallback ? t(opts.fallback) : t('errors.unknown')

  if (err instanceof TypeError && NETWORK_RE.test(msg)) return t('errors.network')
  if (err instanceof SyntaxError || NONJSON_RE.test(msg)) return t('errors.server')
  if (MODERATION_RE.test(msg)) return t('errors.moderation')
  if (AUTH_RE.test(msg)) return t('errors.auth')
  if (RATELIMIT_RE.test(msg)) return t('errors.rateLimit')
  if (SERVER5XX_RE.test(msg)) return t('errors.unavailable')
  if (TIMEOUT_RE.test(msg)) return t('errors.timeout')

  // Pesan pendek yang ramah pengguna dari backend (pendek, mengandung teks bahasa alami, tidak memiliki ciri teknis) langsung diteruskan, mendukung bahasa Cina/Jepang/Korea/Indonesia dll
  if (msg.length <= 80 && NATURAL_LANG_RE.test(msg) && !TECHY_RE.test(msg)) return msg

  if (/^\d{3}$/.test(msg)) return t('errors.requestFailed', { status: msg })

  return opts?.fallback ? t(opts.fallback) : t('errors.unknown')
}

/** Toast kesalahan seragom (default 5s, lebih lama dari toast sukses) */
export function toastError(err: unknown, opts?: { fallback?: string; duration?: number }): void {
  toast.error(mapError(err, opts), { duration: opts?.duration ?? 5000 })
}
