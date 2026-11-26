/**
 * Terjemahkan pesan kesalahan dari layanan AI eksternal (gateway Cina seperti
 * DeepSeek/Volcengine/dll) ke Bahasa Indonesia agar tidak pernah muncul huruf Cina
 * di antarmuka pengguna. Pesan lokal (sudah Bahasa Indonesia/Inggris) dibiarkan apa adanya.
 */

const HAS_CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/

/** Frasa Cina umum → Indonesia. Diurutkan: frasa spesifik dulu, lalu umum. */
const CN_PHRASES: Array<{ re: RegExp; id: string }> = [
  { re: /\u4f59\u989d\u4e0d\u8db3.*\u8bf7\u5145\u503c/,    id: 'Saldo layanan AI tidak mencukupi, silakan isi ulang terlebih dahulu lalu coba lagi' },
  { re: /\u8d26\u53f7(\u5df2\u88ab|\u5df2)?(\u51bb\u7ed3|\u5c01\u7981|\u505c\u7528|\u7981\u7528)/, id: 'Akun layanan AI dibekukan atau dinonaktifkan, hubungi penyedia layanan' },
  { re: /\u8d26\u6237.{0,6}\u51bb\u7ed3/,      id: 'Akun layanan AI sedang dibekukan' },
  { re: /\u4f59\u989d.{0,6}\u4e0d\u8db3/,      id: 'Saldo layanan AI tidak mencukupi' },
  { re: /\u6b20\u8d39/,                id: 'Tagihan akun layanan AI belum dibayar' },
  { re: /\u8bf7\u6c42.{0,4}\u8fc7\u4e8e(\u9891\u7e41|\u5feb\u901f)|\u8c03\u7528\u9891\u7387.{0,6}(\u53d7\u9650|\u8d85\u9650)/, id: 'Terlalu banyak permintaan, silakan coba lagi beberapa saat lagi' },
  { re: /\u89e6\u53d1.{0,4}\u9650\u6d41/,      id: 'Pembatasan kecepatan API aktif, silakan coba lagi nanti' },
  { re: /\u9891\u7387.{0,6}\u8d85\u9650/,      id: 'Frekuensi permintaan melebihi batas, silakan coba lagi nanti' },
  { re: /\u914d\u989d.{0,6}(\u4e0d\u8db3|\u7528\u5c3d)/, id: 'Kuota API tidak mencukupi, perbarui kuota di penyedia layanan' },
  { re: /(API\s*Key|\u5bc6\u94a5|api\s*key).{0,10}(\u65e0\u6548|\u9519\u8bef|\u4e0d\u5408\u6cd5|\u975e\u6cd5)/, id: 'Kunci API tidak valid, periksa kembali di halaman Pengaturan' },
  { re: /(\u9274\u6743|\u8ba4\u8bc1|\u8eab\u4efd\u9a8c\u8bc1).{0,8}(\u5931\u8d25|\u9519\u8bef|\u65e0\u6548)/, id: 'Autentikasi API gagal, periksa kembali kredensial layanan AI' },
  { re: /(\u672a|\u6ca1\u6709)?\u6388\u6743/,      id: 'Permintaan tidak diotorisasi, periksa kembali kredensial API' },
  { re: /(\u6ca1\u6709|\u65e0|\u7f3a\u5c11).{0,6}(\u6743\u9650|\u6388\u6743)/, id: 'Tidak ada izin untuk mengakses layanan AI ini' },
  { re: /(\u6a21\u578b|model).{0,8}(\u4e0d\u5b58\u5728|\u672a\u627e\u5230|\u672a\u5f00\u653e|\u4e0d\u53ef\u7528|\u5931\u6548|\u672a\u542f\u7528)/, id: 'Model AI tidak tersedia untuk konfigurasi ini' },
  { re: /\u4e0d\u652f\u6301\u7684(\u6a21\u578b|model)/, id: 'Model AI tidak didukung oleh penyedia layanan' },
  { re: /(\u53c2\u6570\u9519\u8bef|\u975e\u6cd5\u53c2\u6570|\u53c2\u6570\u4e0d\u5b8c\u6574|\u7f3a\u5c11\u53c2\u6570|\u53c2\u6570\u65e0\u6548)/, id: 'Parameter permintaan tidak valid' },
  { re: /(\u8bf7\u6c42|\u8fde\u63a5|\u8fde\u63a5\u8bf7\u6c42).{0,6}(\u8d85\u65f6|\u8d85\u65f6\u4e86)/, id: 'Permintaan melebihi batas waktu, silakan coba lagi' },
  { re: /(\u8fde\u63a5|\u7f51\u7edc).{0,8}(\u5931\u8d25|\u5f02\u5e38|\u65ad\u5f00|\u4e0d\u53ef\u8fbe|\u4e0d\u901a|\u8d85\u65f6)/, id: 'Gagal terhubung ke layanan AI, periksa koneksi internet' },
  { re: /(\u7cfb\u7edf|\u670d\u52a1\u5668|\u670d\u52a1\u7aef).{0,6}(\u7e41\u5fd9|\u5f02\u5e38|\u9519\u8bef|\u5185\u90e8\u9519\u8bef)/, id: 'Server layanan AI sedang sibuk atau bermasalah, silakan coba lagi nanti' },
  { re: /\u670d\u52a1.{0,6}(\u4e0d\u53ef\u7528|\u6682\u4e0d\u53ef\u7528|\u7ef4\u62a4\u4e2d|\u6682\u505c)/, id: 'Layanan AI sedang tidak tersedia, silakan coba lagi nanti' },
  { re: /(\u5185\u5bb9|\u6587\u672c|\u63d0\u793a\u8bcd|prompt).{0,10}(\u654f\u611f|\u8fdd\u89c4|\u5ba1\u6838|\u4e0d\u5408\u89c4|\u8fdd\u53cd|\u88ab\u62d2|\u62d2\u7edd|\u8fdd\u53cd\u653f\u7b56)/, id: 'Permintaan ditolak karena konten tidak sesuai pedoman layanan AI' },
  { re: /(\u6587\u672c|\u6587\u672c\u5185\u5bb9|\u63d0\u793a\u8bcd|prompt|\u5185\u5bb9|\u8f93\u5165).{0,10}(\u8fc7\u957f|\u8d85\u957f|\u8d85\u51fa|\u8d85\u8fc7).{0,6}(\u957f\u5ea6|\u9650\u5236|\u4e0a\u9650|token)/, id: 'Teks permintaan terlalu panjang untuk model AI ini' },
  { re: /token.{0,6}(\u8fc7\u671f|\u8d85\u9650|\u4e0d\u8db3)/, id: 'Token permintaan bermasalah, silakan coba lagi' },
  { re: /(\u751f\u6210|\u521b\u5efa|\u4efb\u52a1).{0,8}\u5931\u8d25/, id: 'Proses pembuatan gagal, silakan coba lagi' },
  { re: /(\u65e0|\u6ca1\u6709)(\u7a7a\u95f2|\u53ef\u7528).{0,4}(\u8d44\u6e90|\u673a\u5668|\u8282\u70b9)/, id: 'Tidak ada sumber daya tersedia, silakan coba lagi nanti' },
]

/** Pesan Inggris dari adaptor yang harus diterjemahkan */
const EN_PHRASES: Array<{ re: RegExp; id: string }> = [
  { re: /^API error \d+:\s*/,   id: '' },
  { re: /^Timeout:\s*Polling exceeded 10 minutes$/, id: 'Batas waktu pembuatan terlampaui, silakan coba lagi' },
  { re: /^Timeout:\s*polling attempts exhausted$/, id: 'Batas waktu pemrosesan terlampaui, silakan coba lagi' },
  { re: /^Timeout:\s*/,         id: 'Batas waktu terlampaui, silakan coba lagi' },
  { re: /^Generation failed$/i,  id: 'Proses pembuatan gagal' },
  { re: /^Video generation failed$/i, id: 'Proses pembuatan video gagal' },
  { re: /^Image generation failed$/i, id: 'Proses pembuatan gambar gagal' },
  { re: /^No (image|video) URL or base64 data in response$/i, id: 'Respons layanan AI tidak memuat data, silakan coba lagi' },
  { re: /^No (image|video) URL in response$/i, id: 'Respons layanan AI tidak memuat URL, silakan coba lagi' },
  { re: /^Video generation selesai tetapi tidak ada video dalam respons$/i, id: 'Proses selesai tetapi tidak ada video dalam respons' },
  { re: /(incorrect|invalid|bad)\s+(api|bearer)?\s*(key|token|secret)/i, id: 'Kunci API tidak valid, periksa kembali di halaman Pengaturan' },
  { re: /unauthorized|authentication failed|invalid credentials|api key expired/i, id: 'Autentikasi API gagal, periksa kembali kredensial layanan AI' },
  { re: /rate limit|too many requests|exceeded your current quota|insufficient_quota|quota exceeded/i, id: 'Pembatasan kecepatan atau kuota API tercapai, silakan coba lagi nanti' },
  { re: /insufficient balance|no balance|balance is not enough|payment required|prepayment credits? are depleted|credits? are depleted/i, id: 'Saldo layanan AI tidak mencukupi, silakan isi ulang terlebih dahulu lalu coba lagi' },
  { re: /model\s+(not found|does not exist|not supported|not available)/i, id: 'Model AI tidak tersedia atau tidak didukung untuk konfigurasi ini' },
  { re: /network error|connection (failed|refused|reset)|ECONNREFUSED|fetch failed/i, id: 'Gagal terhubung ke layanan AI, periksa koneksi internet' },
  { re: /content (policy|filter)|safety system|blocked by the system|text is being edited/i, id: 'Permintaan ditolak karena konten tidak sesuai pedoman layanan AI' },
]

const GENERIC_CN = 'Layanan AI eksternal mengembalikan kesalahan. Periksa kembali kredensial dan saldo di halaman Pengaturan, lalu coba lagi'

/**
 * Terjemahkan pesan error API eksternal ke Bahasa Indonesia.
 * Pesan lokal (Bahasa Indonesia) yang sudah ada dijamin tidak berubah.
 * @param raw Pesan error dari catch / database
 */
export function translateApiError(raw: string): string {
  const msg = (raw || '').trim()
  if (!msg) return GENERIC_CN

  let text = msg

  // Bersihkan prefix "API error 4xx:" dari fetch layer
  const apiErrMatch = text.match(/^API error \d+:\s*/)
  if (apiErrMatch) text = text.slice(apiErrMatch[0].length).trim()

  // Terjemahkan frasa Cina
  if (HAS_CJK.test(text)) {
    for (const { re, id } of CN_PHRASES) {
      if (re.test(text)) return id
    }
    // Cina tak dikenal
    return GENERIC_CN
  }

  // Terjemahkan frasa Inggris (umum)
  for (const { re, id } of EN_PHRASES) {
    if (re.test(text)) return id || text
  }

  // Pesan non-Cina lainnya: kembalikan apa adanya (sudah Indonesia/Inggris)
  return msg
}

/** Petunjuk singkat per status HTTP untuk pesan error API layanan AI */
const STATUS_HINTS: Record<string, string> = {
  '400': 'Periksa nama model dan parameter yang dipilih.',
  '401': 'Kunci API tidak valid atau belum diisi.',
  '403': 'Kunci API tidak memiliki izin akses ke model ini.',
  '404': 'Base URL atau nama model salah (endpoint tidak ditemukan).',
  '408': 'Penyedia tidak merespons dalam waktu yang wajar.',
  '413': 'Permintaan terlalu besar untuk model AI ini.',
  '429': 'Kuota atau pembatasan kecepatan API tercapai, coba lagi nanti.',
  '500': 'Server penyedia sedang bermasalah.',
  '502': 'Gateway penyedia tidak dapat dihubungi.',
  '503': 'Layanan penyedia sedang tidak tersedia.',
  '504': 'Waktu respons penyedia habis.',
}

/** Pesan yang tidak bisa diterjemahkan apa pun (dihindari ditampilkan mentah) */
const OPAQUE_PROVIDER_ERROR =
  /failed to process error response|failed to process successful response|unexpected token|not valid json|parse error/i

/** Ungkap error rantai cause (AI SDK membungkus error dalam beberapa lapis) sampai menemukan statusCode/message */
function unwrapError(err: unknown): { statusCode?: number; message?: string; url?: string } {
  let cur: any = err
  for (let i = 0; i < 6 && cur; i++) {
    if (typeof cur === 'object' || typeof cur === 'function') {
      const code = typeof cur.statusCode === 'number' ? cur.statusCode : undefined
      if (code !== undefined || typeof cur.message === 'string') {
        return { statusCode: code, message: String(cur.message ?? ''), url: typeof cur.url === 'string' ? cur.url : undefined }
      }
    }
    cur = cur?.cause
  }
  const msg = String((err as { message?: unknown })?.message ?? err ?? '')
  return { message: msg }
}

function statusHint(status?: number): string {
  if (status == null) return 'Silakan periksa kembali konfigurasi layanan AI di halaman Pengaturan.'
  return STATUS_HINTS[String(status)] || 'Silakan periksa kembali konfigurasi layanan AI di halaman Pengaturan.'
}

function toHost(url?: string): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    return u.host || ''
  } catch {
    return ''
  }
}

/**
 * Terjemahkan error (objek) dari pemanggilan Agent / layanan AI menjadi pesan yang dapat ditindaklanjuti.
 * Lebih teliti daripada translateApiError(string): membaca statusCode/url dari objek error AI SDK dan
 * mengubah pesan mentah seperti "Failed to process error response" (respons tidak terbaca) menjadi
 * pesan Bahasa Indonesia + petunjuk sesuai status, supaya pengguna tahu harus memperbaiki apa.
 */
export function describeApiError(err: unknown): string {
  const { statusCode, message, url } = unwrapError(err)
  const raw = (message || String(err ?? '')).trim()

  if (OPAQUE_PROVIDER_ERROR.test(raw) || statusCode != null) {
    const translated = translateApiError(raw.replace(/^API error \d+:\s*/i, '')).trim()
    const statusPart = statusCode != null ? ` (status ${statusCode})` : ''
    const hostPart = toHost(url)

    // Jika pesan terjemahan terasa membantu dan bukan pesan mentah — pakai sebagai inti
    const usable = translated && !OPAQUE_PROVIDER_ERROR.test(translated) && !/Layanan AI eksternal mengembalikan kesalahan/.test(translated)
    const core = usable ? translated : 'Penyedia AI mengembalikan respons error yang tidak dapat dibaca'
    const hint = ` ${statusHint(statusCode)}`
    const tail = hostPart ? ` Host: ${hostPart}.` : ''
    return `${core}${statusPart}.${hint}${tail}`
  }

  return translateApiError(raw)
}