/**
 * Mastra Agent registry
 * Registers static Agents at startup; instructions/model are resolved dynamically per request
 * (workspace/prompts/<agent_type>.md file + model/config_id overrides in RequestContext),
 * episodeId/dramaId are read by tools from RequestContext
 */
import { Agent } from '@mastra/core/agent'
import type { RequestContext } from '@mastra/core/request-context'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { getTextConfig, getTextProviderBaseUrl, getConfigById } from '../services/ai.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'
import { robustFetch } from '../utils/http.js'
import { scriptTools } from './tools/script-tools.js'
import { extractTools } from './tools/extract-tools.js'
import { storyboardTools } from './tools/storyboard-tools.js'
import { imagePromptTools } from './tools/image-prompt-tools.js'
import { episodeTools } from './tools/episode-tools.js'
import { synopsisTools } from './tools/synopsis-tools.js'
import { loadAgentSkills, skillWorkspaces } from './skills.js'
import { loadAgentPromptFile, loadBasePromptFile } from './prompts.js'
import { buildLanguageDirective } from './language.js'
import { getContentLanguageFromRC } from './context.js'

// Default prompts (used when workspace/prompts/<type>.md does not exist)
export const DEFAULT_PROMPTS: Record<string, { name: string; instructions: string }> = {
  episode_expander: {
    name: 'Episode Expansion',
    instructions: `You are a senior story planner, skilled at expanding a full-series synopsis into structured multi-episode outlines.

Each request writes the plot outline for one specific episode (the current episode is determined by episodeId in context).

Workflow:
1. Call read_synopsis_context to read: current episode number, total episodes, drama title/style, full series synopsis, and summaries of previous episodes
2. Based on the synopsis progression and current episode number, plan this episode's story beats (opening connects to previous episode, a stage progression within this episode, ending sets up the next episode)
3. Call save_episode_content to save this episode's plot outline

Content requirements:
- Write in the target language specified by context
- 1500-2500 words per episode, including: core conflict, appearing characters and their goals/emotions, 2-4 plot turns, key scenes and atmosphere, and an ending hook
- Must connect with the previous episode and leave a natural bridge to the next; do not repeat events already completed in the previous episode
- Title should be short and concise, summarizing this episode's theme`,
  },
  script_rewriter: {
    name: 'Script Rewrite',
    instructions: `You are a professional screenwriter, skilled at adapting novels into short-drama screenplays.

Workflow:
1. Call read_episode_script to read the original content (including previous_episode ending: this episode's opening must connect to it, do not repeat events that already happened, do not alter established facts)
2. Rewrite the content yourself into a formatted screenplay
3. Call save_script to save the complete rewritten screenplay

Formatted screenplay format:
- Scene heading: ## S<number> | INT/EXT . Location | Time period
- Action description: natural paragraphs, no camera language
- Dialogue: CharacterName: (state/expression) dialogue content
- Each scene 30-60 seconds of content

Note: You must complete the rewrite yourself, do not just return instructions. After reading the content, output the rewritten result directly and save it.`,
  },
  extractor: {
    name: 'Character & Scene Extraction',
    instructions: `You are a production assistant, skilled at extracting character, scene, and prop information from screenplays, with intelligent deduplication against existing project data.

Workflow:
1. Call read_script_for_extraction to read the formatted screenplay
2. Call read_existing_characters to read existing project characters and characters already linked to the current episode
3. Call read_existing_scenes to read existing project scenes and scenes already linked to the current episode
4. Call read_existing_props to read existing project props and props already linked to the current episode
5. Focus on the current episode script, analyze characters, scenes, and props that actually appear in this episode
6. For each character: merge/update if same name exists, otherwise create new
7. Call save_dedup_characters to save characters (dedup merge, auto handles create/update, links to current episode)
8. Analyze script content, extract all scene information involved in this episode
9. For each scene: reuse if same location+time period exists, otherwise create new
10. Call save_dedup_scenes to save scenes (dedup merge, auto handles create/reuse, links to current episode)
11. Extract key props for this episode — must satisfy BOTH conditions:
    a) Directly drives plot: the item's appearance, handoff, damage, or discovery causes a plot turn (e.g. murder weapon, keepsake, key document, love token, evidence);
    b) Worth generating an image: later storyboards will give it close-ups or repeated appearances, requiring a fixed look.
    Three-check test (answer yourself, any "no" means skip the prop): (1) If removed, does the plot still hold? Yes -> do not extract; (2) Is it just a casual everyday item a character uses (phone, chopsticks, cup, cigarette)? Yes -> do not extract; (3) Is it part of scene furnishing (table, chair, lamp, door, window, decoration)? Yes -> do not extract.
    Better to extract fewer than more: usually 0-3 key props per episode; if more than 3, keep only top 3 by plot importance; if none qualify, extract none
12. For each prop: merge/update if same name exists, otherwise create new
13. Call save_dedup_props to save props (dedup merge, auto handles create/update, links to current episode); if no props to extract, pass an empty array, do not force-fill

Dedup rules:
- Characters/props: exact name match; same name keeps existing (merge info); if name has parenthesized role/alias, compare the base name before parentheses (e.g. "Lin Xiaoyu (protagonist)" and "Lin Xiaoyu" are the same character, prefer reusing existing project entry, do not create duplicates). read_existing_characters / read_existing_props returns normalized_name for this judgment
- Scenes: exact match on [location+time period] (location ignores whitespace/case); same location different time period is a new scene

Extraction requirements:
- Only extract characters, scenes, and props that actually appear or are explicitly mentioned in the current episode and are narratively relevant
- Characters need only two core description fields: appearance (age feel, facial features, build, temperament, etc.; translate personality traits into external temperament and expression within appearance, do not output a separate personality field) and styling (hair, clothing, makeup, accessories, etc.)
- Scenes need only two core description fields: prompt (scene description: space, furnishings, era texture, key visual elements, etc.) and lighting (scene lighting: light source, color tone, brightness, atmosphere, etc.)
- Prop fields: name, type (daily/weapon/vehicle/decoration/document/etc.), description (physical appearance only: material, color, shape, size, wear, etc.; do not write plot usage, do not involve relations to characters or other things). Props do not need image prompts; final prompts are generated later by the prompt generator Agent
- Do not miss any character with dialogue or important actions`,
  },
  storyboard_breaker: {
    name: 'Storyboard Breakdown',
    instructions: `You are a senior film storyboard artist, skilled at breaking scripts into storyboard plans and directly producing prompts usable for video generation.

Core definition: one storyboard = one "storyboard segment" = one video generation task. Each segment is 8-15 seconds, containing 2-4 sub-shots; sub-shots may cut (change shot size/angle/subject) but must not cross scenes.

Workflow:
1. Call read_storyboard_context to read script, character list, scene list, prop list (including previous episode ending previous_episode_tail: except episode 1, the first segment of this episode must connect to it, do not repeat events that already happened)
2. First identify script narrative beats (markers like [Opening][Trigger][Climax][Closing] or narrative turning points); beat boundaries force segment cuts; then split each beat into 1+ storyboard segments, keeping overall plot complete and continuous
3. For each segment, fill production fields together: description (visual description) and video_prompt (video prompt) produced in sync, rules below
4. Call save_storyboards in batches to save all segments: the first batch MUST include replace_existing: true (clear old storyboards for this episode before writing, ensuring full regeneration leaves no old shots), subsequent batches omit replace_existing (append). Max 8 segments per batch, shot_number must increment in order; do not stop before all segments are saved (do not save only part and stop)

Hard constraints (must follow):
- Do not output any planning, analysis, reasoning, or explanatory text; do not retell the script; do not write "I'm..." "First I need..." etc. — keep thinking internal, output only tool calls
- Each output step must be a tool call (or a short closing remark after completion), never output large text blocks before calling tools
- If content is large and needs multiple batches, complete all batches in consecutive tool calls, do not insert text in between

Each segment must fill these fields:
- character_ids: list of character IDs involved in this segment, can be empty or multiple; must be chosen from characters
- prop_ids: list of key prop IDs appearing in this segment (bound when prop is seen/used/close-up in frame), can be empty; must be chosen from props
- scene_id: if a matching scene exists in scenes, fill the correct scene_id; empty if no match
- duration: segment total duration 8-15 seconds
- description: visual description, describe what the audience actually sees and hears per [Shot1][Shot2]... — visuals (who + specific action + body detail + expression) first; if a sub-shot has dialogue, write 'CharacterName says: "dialogue"' inside the corresponding [ShotN], narration as 'Narration: content'
- atmosphere: atmosphere, lighting, color tone, environmental feel
- video_prompt: video generation prompt for this segment (rules below)

Duration rules (hard constraints):
- Total anchor: target total duration = script word count / 500 words per minute, segment count ~= target total duration / 12 seconds, allow +/-20% float
- Pacing tiers: transition segment (travel/empty shot/transition) 8-10s; narrative segment 10-15s; climax segment (close-up/rule reveal/emotional burst/reversal) 12-15s with slower sub-shot pacing
- Dialogue floor: segment duration >= segment dialogue+narration total word count (written in description) / 4.5 words per second + 2s performance margin; split overflow dialogue to next segment

video_prompt rules (hard constraints):
- One 3-second block per line, separated by newlines; each [ShotN] in description maps to 1-2 consecutive 3s blocks (same order, no omission, no new sub-shots), cut points aligned to [ShotN] structure
- Each block writes visuals first (who + action + shot size/angle), then dialogue/narration within that block — dialogue extracted from corresponding [ShotN] in description, do not create dialogue outside description
- Refer to scenes as @SceneName, characters as @CharacterName, names must exactly match the lists returned by read_storyboard_context (used to attach reference images)
- Atmosphere and lighting description taken from this segment's atmosphere
- Cuts allowed within a segment (change shot size/angle/subject), but no scene crossing
- User message will indicate the video model for this run; adjust writing to that model's characteristics and duration limits; if not specified, use generic video model style

Additional requirements:
- Prefer reusing scene_id returned by read_storyboard_context, do not invent new scenes
- Segment character binding must come from character list returned by read_storyboard_context; empty-shot segments with no characters may pass empty array
- Segment prop binding must come from prop list returned by read_storyboard_context; bind when prop is used, close-up, handed off, or clearly visible in frame; do not bind background items unrelated to plot; pass empty array if no props appear
- Segment description must support downstream video generation and export flow
- If a segment has no dialogue, omit dialogue in description, but visual description and atmosphere must still be complete
- If existing_storyboards exist, reference them only when user explicitly requests incremental modification; by default regenerate and save the full episode storyboards from current script.
- Segments must never open or end with fade-in/fade-out from/to black, no black screen and no fade transitions — open mid-action, end frozen on a clear action terminal state; write each block's terminal state clearly, next block opens at that terminal state (continuous action, hard cuts, never fade in/out).`,
  },
  prompt_generator: {
    name: 'Prompt Generator',
    instructions: `You are a professional AI prompt engineer, responsible for creating and saving two types of prompts:
1. "Final prompts" for characters/scenes/props, used directly for image generation
2. "Video prompts" (video_prompt) for storyboards, used directly for video generation

## Image Final Prompts

User requests will specify which characters, scenes, or props need final prompts (with character_id / scene_id / prop_id).

Workflow:
1. Call read_characters / read_scenes / read_props to read asset information
2. Create final prompts following the corresponding asset skill spec (character turnaround / scene fixed angle / prop white-background single product)
3. Call save_character_final_prompt / save_scene_final_prompt / save_prop_final_prompt to save one by one

## Video Prompts

User requests will specify which storyboard needs a video prompt (with storyboard ID).

Workflow:
1. Call read_storyboard_context to read that storyboard's description (including [ShotN] sub-shots and dialogue/narration), atmosphere, duration, and bound scenes/characters
2. Generate video_prompt accordingly: one 3-second block per line separated by newlines; each [ShotN] in description maps to 1-2 consecutive 3s blocks (same order, no omission, no new sub-shots), dialogue/narration extracted from 'CharacterName says: "..."' 'Narration: ...' inside the corresponding [ShotN], do not create dialogue outside description; refer to scenes as @SceneName, characters as @CharacterName (names must exactly match the lists); atmosphere/lighting taken from atmosphere. Cuts allowed within a storyboard segment (change shot size/angle/subject), segments can be different shots, but no scene crossing; cut points aligned to [ShotN] structure in description
3. During generation @Name is automatically replaced with corresponding reference image markers (e.g. @Xiaoming -> @Gambar1Xiaoming), so names must exactly match scene/character lists, no abbreviations or extra symbols
4. When calling update_storyboard, pass only two keys: storyboard_id and video_prompt. Do not pass back any other fields of that storyboard (title, description, scene_id, etc. must not be passed)

General rules:
- All prompts output in the target language specified by the session language directive, single coherent description, no bullet points, no irrelevant words
- The project visual style description is automatically injected at the front of the final prompt by the tool when saving image prompts; do not add style words yourself
- video_prompt must never contain fade-in/fade-out, black screen, or transitions; write clear action start/end states for each block (previous block end state = next block start state), ensuring natural hard cuts
- You must actually call save tools, do not just return prompts in the reply`,
  },
  synopsis_generator: {
    name: 'Sinopsis Generator',
    instructions: `Anda adalah penulis naskah dan produser kreatif yang mengubah ide cerita mentah menjadi sinopsis lengkap sebuah proyek film pendek / drama berseri.

Tugas:
1. Baca ide mentah (Panggil read_synopsis_draft bila perlu; ide juga tersedia di pesan pengguna).
2. Ciptakan cerita pendek drama yang utuh bersumber dari ide tersebut.
3. Tentukan judul, genre, gaya visual (value preset gaya: 3d, anime, ghibli, watercolor, comic, guofeng, webtoon, noir, indo_modern, indo_classic, indo_epic, indo_sinetron, indo_horor, indo_perjuangan; gunakan 3d bila ragu), rasio aspek (16:9 atau 9:16), sinopsis lengkap, deskripsi singkat (teaser), 3-6 tag/serial, dan cover_prompt berbahasa Inggris untuk poster sampul proyek.
4. Panggil save_synopsis_draft untuk menyimpan hasil; jangan berhenti sebelum tool tersebut berhasil dipanggil.

Persyaratan sinopsis:
- Tulis sinopsis dalam bahasa yang diminta, lengkap dan berkesinambungan, mencakup: premis/logline, karakter utama dan konflik utamanya, alur beberapa episode menuju klimaks dan resolusi, serta pesan emosional cerita.
- Konkret dan sinematis, bukan ringkasan abstrak: sebut nama tokoh, lokasi, serta momen-momen kunci.
- Durasi perkiraan total 1-20 episode, sesuai kebutuhan cerita (wajib naratif utuh).

Persyaratan deskripsi:
- 2-4 kalimat kalimat teaser yang menarik untuk cover/sinopsis iklan, dalam bahasa yang diminta.

Persyaratan cover_prompt:
- Tulis dalam Bahasa Inggris, deskriptif untuk gambar AI: karakter utama + ekspresi + pose, latar/suasana, pencahayaan, dan gaya film.
- Sertakan 'portrait movie poster, cinematic lighting, high detail'.
- JANGAN menyertakan teks/huruf dalam hasil gambar.`,
  },
  publish_copier: {
    name: 'Konten Publikasi',
    instructions: `Anda adalah kreator konten sosial media yang menyiapkan materi publikasi video drama pendek ke YouTube / TikTok / Facebook / Instagram.

Anda menerima informasi episode (judul, sinopsis, deskripsi). Balas HANYA satu objek JSON tanpa pembungkus apapun, dengan format:
{ "title": "...", "description": "...", "tags": ["...", "..."] }

Persyaratan:
- title: judul video yang menarik dalam bahasa konten target, singkat dan mengundang klik (max 100 karakter).
- description: 2-4 paragraf pendek dalam bahasa konten target: ringkasan menarik, termasuk sinyal dari sinopsis, ajakan tonton, dan 3-5 hashtag relevan di baris terakhir (tanpa spasi, huruf pertama kapital).
- tags: 5-8 kata kunci pencarian (tanpa #), gabungan tema cerita + genre + karakter utama.
- JANGAN keluar dari format JSON. Jangan tambahkan teks lain di luar objek JSON.`,
  },
}

export const validAgentTypes = Object.keys(DEFAULT_PROMPTS)

// Agen mengurai ulang model di setiap langkah, endpoint yang sama hanya mencatat sekali untuk menghindari spam log
let lastLoggedTextEndpointKey = ''

/**
 * Menonaktifkan mode thinking (pemikiran)
 *
 * Latar belakang: beberapa proxy (new-api style) mewajibkan pengembalian reasoning_content dalam
 * permintaan multi-putar untuk model thinking, namun Agent dengan pemanggilan tool multi-putar
 * tidak dapat mengembalikannya → 400 ("The `reasoning_content` ... must be passed back to the API").
 * Di sini parameter penonaktifan thinking disuntikkan ke dalam body permintaan dengan gaya masing-masing
 * penyedia agar model tidak menghasilkan reasoning_content.
 *
 * CATATAN: field `thinking` TIDAK lagi dikirim (relay strict, mis. api.hcnsec.cn, membalas 400
 * ""thinking" is not supported on /v1/chat/completions"). `enable_thinking` juga TIDAK dikirim lagi:
 * beberapa relay (new-api style) memvalidasi parameter tak dikenal per channel dan menolak dengan
 * 400 "Unsupported parameter(s): `enable_thinking`". Kombinasi `enable_thinking:false` yang dulu
 * lolos di hcnsec kini ikut ditolak (30+ karya, satu host berbeda perilaku dari waktu ke waktu).
 * Parameter default cukup `reasoning_effort: none` (enum gaya OpenAI, diterima DeepSeek V4 di hcnsec).
 *
 * Pertahanan berlapis: createThinkingOffFetch akan "menyembuhkan diri" bila relay membalas 400
 * "unsupported/invalid/unknown parameter" — dimuat ulang sekali tanpa patch thinking ini, agar
 * provider apa pun tetap berjalan kendati menolak `reasoning_effort`. Provider yang justru butuh
 * `thinking` bisa diatur manual lewat AI_THINKING_OFF_PATCH.
 *
 * - Diaktifkan secara default; AI_DISABLE_THINKING=false dapat menonaktifkan penyuntikan
 * - Melewati endpoint resmi OpenAI / Gemini (API resmi akan menolak parameter yang tidak dikenal)
 * - AI_THINKING_OFF_PATCH dapat menerima JSON untuk menimpa parameter gaya OpenAI yang disuntikkan (untuk berbagai proxy)
 */
const thinkingOffEnabled = (process.env.AI_DISABLE_THINKING ?? 'true').toLowerCase() !== 'false'

function isOfficialTextHost(baseURL: string) {
  return /api\.openai\.com|generativelanguage\.googleapis\.com/.test(baseURL)
}

function openaiThinkingOffPatch(): Record<string, any> {
  // JANGAN mengirim `thinking` (relay hcnsec → 400 ""thinking" is not supported") maupun
  // `enable_thinking` (relay new-api style → 400 "Unsupported parameter(s): `enable_thinking`").
  // Cukup reasoning_effort: none — enum gaya OpenAI yang diterima DeepSeek V4 di hcnsec dan
  // mematikan reasoning tanpa menimbulkan 400.
  const fallback = {
    reasoning_effort: 'none', // Enum gaya OpenAI (channel Gemini dipetakan ke budget 0)
  }
  const raw = process.env.AI_THINKING_OFF_PATCH
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function createThinkingOffFetch(providerName: string, baseURL: string, inner: typeof fetch = robustFetch): typeof fetch | undefined {
  if (!thinkingOffEnabled || isOfficialTextHost(baseURL)) return undefined
  const openaiPatch = openaiThinkingOffPatch()

  return async (input: any, init?: any) => {
    const originalBody = init && typeof init.body === 'string' ? init.body : undefined
    let injected = false
    try {
      if (originalBody !== undefined) {
        const body = JSON.parse(originalBody)
        if (providerName === 'gemini' && Array.isArray(body?.contents)) {
          // Format native Gemini
          body.generationConfig = {
            ...(body.generationConfig || {}),
            thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
          }
          init = { ...init, body: JSON.stringify(body) }
          injected = true
        } else if (Array.isArray(body?.messages)) {
          // Format kompatibel OpenAI
          const before = JSON.stringify(body)
          Object.assign(body, openaiPatch)
          const after = JSON.stringify(body)
          if (before !== after) {
            init = { ...init, body: after }
            injected = true
          }
        }
      }
    } catch { /* Jika parsing gagal, teruskan apa adanya */ }

    const result = await inner(input, init)
    if (!injected || result.status !== 400) return result

    // Penyembuhan diri: relay/strict new-api bisa menolak parameter thinking dengan 400
    // ("Unsupported parameter(s): `enable_thinking`" / "unknown/invalid parameter ... not supported").
    // Kalau terdeteksi, muat ulang SEKALI tanpa patch thinking ini; patch temperature/max_tokens tetap ikut.
    let rejected = false
    try {
      const text = await result.clone().text()
      rejected = /unsupported\s+paramet|unknown\s+paramet|invalid\s+paramet|unexpected\s+paramet|paramet(er|ers)?\s+(is\s+)?not\s+supported|`[\w._-]+`\s+is\s+not\s+supported/i.test(text)
    } catch { /* body tidak dapat dibaca, lanjutkan apa adanya */ }
    if (!rejected || originalBody === undefined) return result

    return inner(input, { ...init, body: originalBody })
  }
}

/**
 * Menulis suhu yang dikonfigurasi ke dalam body permintaan
 *
 * Latar belakang: Beberapa server model memaksa suhu tetap (misalnya seri kimi-k2 hanya mengizinkan 0.6,
 * dengan error "invalid temperature: only 0.6 is allowed for this model"),
 * sehingga perlu ditentukan secara eksplisit dalam konfigurasi layanan teks dan dikirimkan dengan setiap permintaan.
 * Ketika thinking-off fetch diberikan sebagai inner, kedua patch dapat di-stack secara berurutan.
 */
function createTemperatureFetch(providerName: string, temperature: number, inner?: typeof fetch): typeof fetch {
  const base = inner || robustFetch
  return async (input: any, init?: any) => {
    try {
      if (init?.body && typeof init.body === 'string') {
        const body = JSON.parse(init.body)
        if (providerName === 'gemini' && Array.isArray(body?.contents)) {
          // Format native Gemini
          body.generationConfig = { ...(body.generationConfig || {}), temperature }
          init = { ...init, body: JSON.stringify(body) }
        } else if (Array.isArray(body?.messages)) {
          // Format kompatibel OpenAI
          body.temperature = temperature
          init = { ...init, body: JSON.stringify(body) }
        }
      }
    } catch { /* Jika parsing gagal, teruskan apa adanya */ }
    return base(input, init)
  }
}

/**
 * Menyuntikkan batas output ke dalam body permintaan
 *
 * Latar belakang: Output Agent mungkin berisi teks perencanaan panjang + pemanggilan tool (terutama saat penyimpanan batch),
 * namun max_tokens default penyedia layanan sangat kecil (misalnya DeepSeek default 4096/8192),
 * sehingga model terpotong di tengah penulisan dan pemanggilan tool tidak pernah dihasilkan,
 * yang terlihat sebagai "Agent selesai normal tetapi tidak ada yang tersimpan".
 * Di sini batas output dinaikkan secara eksplisit untuk memberi ruang yang cukup bagi model menghasilkan pemanggilan tool secara lengkap.
 * AI_MAX_TOKENS dapat menimpa nilai default (misalnya beberapa proxy memiliki batasan lebih ketat).
 *
 * Endpoint resmi OpenAI tidak disuntikkan: model reasoning (seri o/gpt-5) menolak max_tokens
 * (meminta max_completion_tokens), dan batas output default resmi sudah cukup besar,
 * masalah potongan terutama muncul pada proxy/endpoint tipe DeepSeek.
 */
const defaultMaxTokens = Number(process.env.AI_MAX_TOKENS || 16384)

function isOfficialOpenAIHost(baseURL: string) {
  return /api\.openai\.com/.test(baseURL)
}

function createMaxTokensFetch(providerName: string, inner?: typeof fetch): typeof fetch {
  const base = inner || robustFetch
  return async (input: any, init?: any) => {
    try {
      if (init?.body && typeof init.body === 'string') {
        const body = JSON.parse(init.body)
        if (providerName === 'gemini' && Array.isArray(body?.contents)) {
          // Format native Gemini
          body.generationConfig = { ...(body.generationConfig || {}), maxOutputTokens: defaultMaxTokens }
          init = { ...init, body: JSON.stringify(body) }
        } else if (Array.isArray(body?.messages)) {
          // Format kompatibel OpenAI
          body.max_tokens = defaultMaxTokens
          init = { ...init, body: JSON.stringify(body) }
        }
      }
    } catch { /* Jika parsing gagal, teruskan apa adanya */ }
    return base(input, init)
  }
}

/**
 * Menyederhanakan array `messages` agar hanya ada tepat satu `system` di index 0.
 *
 * Latar belakang: beberapa model (terutama Qwen3.x lewat vLLM / new-api relay) mewajibkan
 * tepat satu `system` message di awal. Mastra multi-step tool-loop + skill/workspace
 * dapat menginjeksi beberapa `system` messages (instruksi dasar, skill, bahasa),
 * yang menyebabkan 400 "System message must be at the beginning" di relay hcnsec.
 *
 * Operasi ini lossless: semua teks system digabung dengan \n\n, urutan pesan lain tetap.
 * Dilapisi hanya untuk permintaan OpenAI-compatible (`body.messages`), bukan Gemini `contents`.
 */
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((p: any) => p?.text || '').filter(Boolean).join('\n')
  return ''
}

function createSystemCoalesceFetch(inner: typeof fetch = robustFetch): typeof fetch {
  return async (input: any, init?: any) => {
    const originalBody = init && typeof init.body === 'string' ? init.body : undefined
    if (originalBody === undefined) return inner(input, init)

    let patchedInit = init
    try {
      const body = JSON.parse(originalBody)
      if (!Array.isArray(body?.messages) || body.messages.length <= 1) return inner(input, init)

      const sysTexts: string[] = []
      const nonSystem: any[] = []
      let needsCoalesce = false

      for (let i = 0; i < body.messages.length; i++) {
        const m = body.messages[i]
        if (m && (m.role === 'system' || m.role === 'developer')) {
          sysTexts.push(extractTextFromContent(m.content))
          if (i !== 0) needsCoalesce = true // system not at index 0
        } else {
          nonSystem.push(m)
        }
      }

      if (sysTexts.length <= 1 && !needsCoalesce) return inner(input, init)

      body.messages = sysTexts.length > 0
        ? [{ role: 'system', content: sysTexts.filter(Boolean).join('\n\n') }, ...nonSystem]
        : nonSystem
      patchedInit = { ...init, body: JSON.stringify(body) }
    } catch { /* body tidak dapat diproses, lanjutkan apa adanya */ }

    return inner(input, patchedInit)
  }
}

// ─── Model otomatis (provider OpenAI-compatible dengan Base URL kustom) ────────
// Saat field model kosong / set ke "auto", backend mengambil daftar model dari
// GET {baseURL}/models (pola new-api / api.hcnsec.cn) lalu memilih model chat yang
// paling cocok untuk endpoint /v1/chat/completions. Hasil di-cache agar siklus
// multi-langkah Agent tidak berulang kali mengetuk endpoint.
const autoModelCache = new Map<string, { model: string; at: number }>()
const AUTO_MODEL_TTL = 10 * 60_000

function scoreChatModel(id: string): number {
  const s = id.toLowerCase()
  let score = 0
  // Model cepat/ekonomis mendapat skor lebih tinggi supaya auto memilih model ringan (hemat token & latensi rendah)
  if (/(mini|flash|lite|small|fast|nano|air|turbo|next)/i.test(s)) score += 4
  if (/gpt|o1|o3|deepseek|qwen|glm|kimi|moonshot|doubao|claude|gemini|chat|think|pro-latest|reasoning/i.test(s)) score += 2
  if (/(image|video|audio|whisper|tts|speech|embedding|rerank|moderation|dall|transcri|vector)/i.test(s)) score -= 20
  return score
}

async function autoResolveTextModel(baseURL: string, apiKey: string, providerName: string): Promise<string> {
  const cacheKey = `${providerName}|${baseURL}`
  const cached = autoModelCache.get(cacheKey)
  if (cached && Date.now() - cached.at < AUTO_MODEL_TTL) return cached.model

  const base = baseURL.replace(/\/+$/, '')
  const endpoints = [new Set([`${base}/models`, `${base}/v1/models`])]
  let ids: string[] = []
  for (const url of endpoints[0]) {
    try {
      const resp = await robustFetch(url, {
        method: 'GET',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(15_000),
      })
      if (!resp.ok) continue
      const json: any = await resp.json()
      const data = json?.data || json?.models
      ids = Array.isArray(data) ? data.map((m: any) => String(m?.id || m?.model || '')).filter(Boolean) : []
      if (ids.length) break
    } catch (err: any) {
      logTaskWarn('AIConfig', 'auto-model-probe-failed', { url, error: err.message })
    }
  }

  if (!ids.length) {
    logTaskWarn('AIConfig', 'auto-model-empty', { baseURL })
    throw new Error('Model tidak ditentukan dan daftar model tidak dapat diambil otomatis dari Base URL. Periksa Base URL atau isi field model di Pengaturan.')
  }

  const chosen = [...ids].sort((a, b) => scoreChatModel(b) - scoreChatModel(a))[0]
  autoModelCache.set(cacheKey, { model: chosen, at: Date.now() })
  logTaskProgress('AIConfig', 'auto-model-resolved', { baseURL, model: chosen })
  return chosen
}

async function getModel(fileModel: string | undefined, modelOverride?: string, textConfigId?: number) {
  // Permintaan dapat menentukan konfigurasi teks (termasuk provider/baseUrl/apiKey), jika tidak maka kembali ke konfigurasi yang aktif
  const textConfig = (textConfigId ? await getConfigById(textConfigId) : null) || await getTextConfig()
  let modelName = modelOverride || fileModel || textConfig.model
  const providerName = textConfig.provider.toLowerCase()
  const resolvedBaseURL = getTextProviderBaseUrl(textConfig)
  const temperature = textConfig.temperature ?? null

  // "Model otomatis": model kosong/auto → resolusi dari daftar /models penyedia
  if (!modelName || modelName.toLowerCase() === 'auto') {
    if (providerName === 'gemini') {
      throw new Error('Model otomatis tidak mendukung provider Gemini, isi field model di Pengaturan')
    }
    modelName = await autoResolveTextModel(resolvedBaseURL, textConfig.apiKey, providerName)
  }

  const endpointKey = `${providerName}|${resolvedBaseURL}|${modelName}|t=${temperature ?? 'default'}`
  if (endpointKey !== lastLoggedTextEndpointKey) {
    lastLoggedTextEndpointKey = endpointKey
    logTaskProgress('AIConfig', 'text-model-endpoint', {
      provider: textConfig.provider,
      baseUrl: resolvedBaseURL,
      model: modelName,
      ...(temperature !== null ? { temperature } : {}),
    })
  }

  // Menumpuk patch permintaan: system-coalesce (dasar, utk host Qwen/strict) → thinking-off
  // (endpoint non-resmi) → suhu yang dikonfigurasi → batas output (non-resmi OpenAI)
  const coalesceFetch = createSystemCoalesceFetch()
  const thinkingOffFetch = createThinkingOffFetch(providerName, resolvedBaseURL, coalesceFetch)
  const tempFetch = temperature !== null
    ? createTemperatureFetch(providerName, temperature, thinkingOffFetch)
    : thinkingOffFetch
  const fetchImpl = isOfficialOpenAIHost(resolvedBaseURL)
    ? tempFetch
    : createMaxTokensFetch(providerName, tempFetch)

  if (providerName === 'gemini') {
    const googleProvider = createGoogleGenerativeAI({
      apiKey: textConfig.apiKey,
      baseURL: resolvedBaseURL,
      fetch: fetchImpl,
    })
    return googleProvider(modelName)
  }

  const provider = createOpenAI({
    baseURL: resolvedBaseURL,
    apiKey: textConfig.apiKey,
    fetch: fetchImpl,
  } as any)
  return provider.chat(modelName)
}

const AGENT_TOOLS: Record<string, Record<string, any>> = {
  episode_expander: episodeTools,
  script_rewriter: scriptTools,
  extractor: extractTools,
  storyboard_breaker: storyboardTools,
  prompt_generator: {
    ...imagePromptTools,
    readStoryboardContext: storyboardTools.readStoryboardContext,
    updateStoryboard: storyboardTools.updateStoryboard,
  },
  synopsis_generator: synopsisTools,
}

/** instructions diurai berdasarkan permintaan: file prompt (atau default) + gabungan seluruh skill + blok instruksi bahasa target
 *  Teks prompt/skill beralih varian bahasa sesuai bahasa konten (<type>.<lang>.md / SKILL.<lang>.md), jika tidak ada kembali ke versi Mandarin */
function buildInstructions(type: string) {
  return async ({ requestContext }: { requestContext?: RequestContext }) => {
    const defaults = DEFAULT_PROMPTS[type]
    const lang = getContentLanguageFromRC(requestContext)
    const promptFile = await loadAgentPromptFile(type, lang)
    const baseInstructions = promptFile?.instructions || defaults.instructions
    const skillInstructions = await loadAgentSkills(type, lang)
    const languageDirective = buildLanguageDirective(lang)
    return [baseInstructions, skillInstructions, languageDirective]
      .filter(Boolean)
      .join('\n\n')
  }
}

/** model diurai berdasarkan permintaan: frontmatter file prompt versi dasar + modelOverride/textConfigId dari RequestContext menimpa
 *  (model hanya mengenali prompts/<type>.md versi dasar, varian bahasa tidak ikut serta dalam penguraian model) */
function buildModel(type: string) {
  return async ({ requestContext }: { requestContext?: RequestContext }) => {
    const promptFile = await loadBasePromptFile(type)
    const modelOverride = requestContext?.get('modelOverride' as never) as string | undefined
    const textConfigId = requestContext?.get('textConfigId' as never) as number | undefined
    return getModel(promptFile?.model || undefined, modelOverride, textConfigId)
  }
}

/** Tabel Agen statis yang didaftarkan saat startup (untuk dipasang pada instans Mastra) */
export const agentRegistry: Record<string, Agent> = Object.fromEntries(
  validAgentTypes.map(type => [
    type,
    new Agent({
      id: type,
      name: DEFAULT_PROMPTS[type].name,
      instructions: buildInstructions(type),
      model: buildModel(type),
      tools: AGENT_TOOLS[type],
      workspace: skillWorkspaces[type],
      skillsFormat: 'markdown',
    }),
  ]),
)
