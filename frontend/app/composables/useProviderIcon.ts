/**
 * Ikon produsen — dual tema di-host secara lokal (app/public/icons/{light,dark}/, berasal dari chatfire-gateway)
 * resolvedTheme adalah computed tingkat modul, pemanggilan fungsi ini di template akan responsif mengikuti peralihan tema
 */
import { resolvedTheme } from '~/composables/useTheme'

const FILENAMES: Record<string, string> = {
  openai: 'openai.png',
  gemini: 'gemini-color.png',
  volcengine: 'volcengine-color.png',
  minimax: 'minimax-color.png',
  claude: 'claude-color.png',
  deepseek: 'deepseek-color.png',
  doubao: 'doubao-color.png',
  moonshot: 'kimi-color.png',
  qwen: 'qwen-color.png',
  aliyun: 'qwen-color.png',  // Aliyun Wan series dan Qwen sama-sama berasal dari Alibaba, berbagi ikon
  zhipu: 'zhipu-color.png',
  xai: 'grok.png',
  xiaomi: 'xiaomi-color.png',
  vidu: 'vidu-color.png',
  ollama: 'ollama.png',
  midjourney: 'midjourney.png',
}

/** provider → URL ikon di tema saat ini; produsen tidak dikenal mengembalikan undefined (pemanggil kembali ke badge huruf) */
export function providerIconUrl(provider?: string | null): string | undefined {
  const file = FILENAMES[(provider || '').toLowerCase()]
  return file ? `/icons/${resolvedTheme.value}/${file}` : undefined
}

/**
 * Nama model → inferensi produsen (berdasarkan prioritas dari atas ke bawah, langsung mengembalikan saat cocok).
 * Skenario: konfigurasi melalui gateway kompatibel openai (provider=openai) tetapi model sebenarnya deepseek/gemini dll,
 * Saat itu ikon harus berdasarkan nama model, bukan provider.
 * Tidak termasuk doubao/seedance: model ini dibatalkan oleh layanan volcengine, ikon provider lebih akurat.
 */
const MODEL_PROVIDER_HINTS: [RegExp, string][] = [
  [/deepseek/i, 'deepseek'],
  [/claude/i, 'claude'],
  [/gemini/i, 'gemini'],
  [/kimi|moonshot/i, 'moonshot'],
  [/qwen|^wan[\d.-]/i, 'qwen'],
  [/glm|zhipu|chatglm/i, 'zhipu'],
  [/grok/i, 'xai'],
  [/^(gpt|chatgpt|o[1-9])/i, 'openai'],
]

/** Ikon yang dipengaruhi oleh model: jika nama model dapat mengidentifikasi produsen, prioritaskan, jika tidak kembali ke provider */
export function modelIconUrl(provider?: string | null, model?: string | null): string | undefined {
  const m = model || ''
  for (const [re, p] of MODEL_PROVIDER_HINTS) {
    if (re.test(m)) return providerIconUrl(p)
  }
  return providerIconUrl(provider)
}
