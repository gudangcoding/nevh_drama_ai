/**
 * Blok instruksi bahasa konten AI — dihasilkan berdasarkan bahasa target di RequestContext, ditambahkan di akhir instruksi Agent
 *
 * Poin desain:
 * - zh / tidak diatur mengembalikan string kosong: perilaku default sepenuhnya konsisten dengan sejarah, biaya token nol
 * - Instruksi ditulis dalam bahasa Inggris (model multibahasa paling patuh), bahasa target ditandai dengan nama asli
 * - Harus menyertakan deklarasi "prioritas tertinggi": template workspace pengguna desktop yang sudah terinstal tidak akan ditimpa
 *   (cpSync force:false), batasan "hanya output Cina" di SKILL.md lama hanya bisa ditekan oleh penimpaan eksplisis di sini
 */

const LANGUAGE_NATIVE_NAMES: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  id: 'Bahasa Indonesia (Indonesian)',
}

export function buildLanguageDirective(lang?: string | null): string {
  if (!lang || lang === 'zh') return ''
  const native = LANGUAGE_NATIVE_NAMES[lang] || lang
  return [
    '## Output Language (HIGHEST PRIORITY)',
    '',
    `ALL user-facing content you produce (scripts, dialogue, extracted fields, storyboard descriptions, atmosphere, image prompts, video prompts, asset names for NEW assets) MUST be written in ${native}.`,
    '',
    'This instruction has the highest priority and OVERRIDES any conflicting language requirement anywhere else in these instructions or skills — including requirements such as "output must be pure Chinese / \u53ea\u8f93\u51fa\u4e2d\u6587". Ignore those.',
    '',
    'Exceptions:',
    '- When referencing EXISTING assets with @mentions (e.g. in video prompts), the name after @ must EXACTLY match the asset name as it appears in the provided asset lists — do NOT translate or rewrite existing asset names.',
    '- The visual style prefix of image prompts is injected automatically by the system (in English). Do not translate, rewrite, or duplicate it.',
  ].join('\n')
}
