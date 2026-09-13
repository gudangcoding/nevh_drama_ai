/**
 * Terjemahkan pesan kesalahan dari layanan AI eksternal (gateway Cina seperti
 * DeepSeek/Volcengine/dll) ke Bahasa Indonesia agar tidak pernah muncul huruf Cina
 * di antarmuka pengguna. Pesan lokal (sudah Bahasa Indonesia/Inggris) dibiarkan apa adanya.
 */

const HAS_CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/

/** Frasa Cina umum → Indonesia. Diurutkan: frasa spesifik dulu, lalu umum. */
const CN_PHRASES: Array<{ re: RegExp; id: string }> = [
  { re: /余额不足.*请充值/,    id: 'Saldo layanan AI tidak mencukupi, silakan isi ulang terlebih dahulu lalu coba lagi' },
  { re: /账号(已被|已)?(冻结|封禁|停用|禁用)/, id: 'Akun layanan AI dibekukan atau dinonaktifkan, hubungi penyedia layanan' },
  { re: /账户.{0,6}冻结/,      id: 'Akun layanan AI sedang dibekukan' },
  { re: /余额.{0,6}不足/,      id: 'Saldo layanan AI tidak mencukupi' },
  { re: /欠费/,                id: 'Tagihan akun layanan AI belum dibayar' },
  { re: /请求.{0,4}过于(频繁|快速)|调用频率.{0,6}(受限|超限)/, id: 'Terlalu banyak permintaan, silakan coba lagi beberapa saat lagi' },
  { re: /触发.{0,4}限流/,      id: 'Pembatasan kecepatan API aktif, silakan coba lagi nanti' },
  { re: /频率.{0,6}超限/,      id: 'Frekuensi permintaan melebihi batas, silakan coba lagi nanti' },
  { re: /配额.{0,6}(不足|用尽)/, id: 'Kuota API tidak mencukupi, perbarui kuota di penyedia layanan' },
  { re: /(API\s*Key|密钥|api\s*key).{0,10}(无效|错误|不合法|非法)/, id: 'Kunci API tidak valid, periksa kembali di halaman Pengaturan' },
  { re: /(鉴权|认证|身份验证).{0,8}(失败|错误|无效)/, id: 'Autentikasi API gagal, periksa kembali kredensial layanan AI' },
  { re: /(未|没有)?授权/,      id: 'Permintaan tidak diotorisasi, periksa kembali kredensial API' },
  { re: /(没有|无|缺少).{0,6}(权限|授权)/, id: 'Tidak ada izin untuk mengakses layanan AI ini' },
  { re: /(模型|model).{0,8}(不存在|未找到|未开放|不可用|失效|未启用)/, id: 'Model AI tidak tersedia untuk konfigurasi ini' },
  { re: /不支持的(模型|model)/, id: 'Model AI tidak didukung oleh penyedia layanan' },
  { re: /(参数错误|非法参数|参数不完整|缺少参数|参数无效)/, id: 'Parameter permintaan tidak valid' },
  { re: /(请求|连接|连接请求).{0,6}(超时|超时了)/, id: 'Permintaan melebihi batas waktu, silakan coba lagi' },
  { re: /(连接|网络).{0,8}(失败|异常|断开|不可达|不通|超时)/, id: 'Gagal terhubung ke layanan AI, periksa koneksi internet' },
  { re: /(系统|服务器|服务端).{0,6}(繁忙|异常|错误|内部错误)/, id: 'Server layanan AI sedang sibuk atau bermasalah, silakan coba lagi nanti' },
  { re: /服务.{0,6}(不可用|暂不可用|维护中|暂停)/, id: 'Layanan AI sedang tidak tersedia, silakan coba lagi nanti' },
  { re: /(内容|文本|提示词|prompt).{0,10}(敏感|违规|审核|不合规|违反|被拒|拒绝|违反政策)/, id: 'Permintaan ditolak karena konten tidak sesuai pedoman layanan AI' },
  { re: /(文本|文本内容|提示词|prompt|内容|输入).{0,10}(过长|超长|超出|超过).{0,6}(长度|限制|上限|token)/, id: 'Teks permintaan terlalu panjang untuk model AI ini' },
  { re: /token.{0,6}(过期|超限|不足)/, id: 'Token permintaan bermasalah, silakan coba lagi' },
  { re: /(生成|创建|任务).{0,8}失败/, id: 'Proses pembuatan gagal, silakan coba lagi' },
  { re: /(无|没有)(空闲|可用).{0,4}(资源|机器|节点)/, id: 'Tidak ada sumber daya tersedia, silakan coba lagi nanti' },
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
  { re: /insufficient balance|no balance|balance is not enough|payment required/i, id: 'Saldo layanan AI tidak mencukupi, silakan isi ulang terlebih dahulu lalu coba lagi' },
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