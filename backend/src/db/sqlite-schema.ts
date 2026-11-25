/**
 * SQLite startup table DDL + seed data (translated from mysql-schema.ts)
 * - AUTO_INCREMENT -> AUTOINCREMENT; remove ENGINE/CHARSET; TINYINT(1) -> INTEGER
 * - MySQL inline INDEX split into independent CREATE INDEX IF NOT EXISTS
 * - Seed commands remove FROM DUAL (illegal in SQLite), idempotent semantics (WHERE NOT EXISTS) preserved
 */
import type Database from 'better-sqlite3'

export const sqliteSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'user',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`,

  `CREATE TABLE IF NOT EXISTS dramas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    synopsis TEXT,
    genre TEXT,
    style TEXT DEFAULT '3d',
    aspect_ratio TEXT DEFAULT '16:9',
    total_episodes INTEGER DEFAULT 1,
    total_duration INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    thumbnail TEXT,
    tags TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    script_content TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    video_url TEXT,
    thumbnail TEXT,
    image_config_id INTEGER,
    video_config_id INTEGER,
    resolution TEXT DEFAULT '720p',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    description TEXT,
    appearance TEXT,
    styling TEXT,
    final_prompt TEXT,
    personality TEXT,
    image_url TEXT,
    reference_images TEXT,
    seed_value TEXT,
    sort_order INTEGER,
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    episode_id INTEGER,
    location TEXT NOT NULL,
    time TEXT NOT NULL,
    prompt TEXT NOT NULL,
    lighting TEXT,
    final_prompt TEXT,
    storyboard_count INTEGER DEFAULT 1,
    image_url TEXT,
    status TEXT DEFAULT 'pending',
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS storyboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    scene_id INTEGER,
    storyboard_number INTEGER NOT NULL,
    title TEXT,
    location TEXT,
    time TEXT,
    shot_type TEXT,
    angle TEXT,
    movement TEXT,
    result TEXT,
    atmosphere TEXT,
    image_prompt TEXT,
    video_prompt TEXT,
    bgm_prompt TEXT,
    sound_effect TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    composed_image TEXT,
    first_frame_image TEXT,
    last_frame_image TEXT,
    reference_images TEXT,
    video_url TEXT,
    subtitle_url TEXT,
    composed_video_url TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS episode_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_episode_characters_episode_id ON episode_characters (episode_id)`,
  `CREATE INDEX IF NOT EXISTS idx_episode_characters_character_id ON episode_characters (character_id)`,

  `CREATE TABLE IF NOT EXISTS episode_scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_episode_scenes_episode_id ON episode_scenes (episode_id)`,
  `CREATE INDEX IF NOT EXISTS idx_episode_scenes_scene_id ON episode_scenes (scene_id)`,

  `CREATE TABLE IF NOT EXISTS episode_props (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    prop_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_episode_props_episode_id ON episode_props (episode_id)`,
  `CREATE INDEX IF NOT EXISTS idx_episode_props_prop_id ON episode_props (prop_id)`,

  `CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    PRIMARY KEY (storyboard_id, character_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_storyboard_characters_character_id ON storyboard_characters (character_id)`,

  `CREATE TABLE IF NOT EXISTS storyboard_props (
    storyboard_id INTEGER NOT NULL,
    prop_id INTEGER NOT NULL,
    PRIMARY KEY (storyboard_id, prop_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_storyboard_props_prop_id ON storyboard_props (prop_id)`,

  `CREATE TABLE IF NOT EXISTS ai_service_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_type TEXT NOT NULL,
    provider TEXT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT,
    endpoint TEXT,
    query_endpoint TEXT,
    priority INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    settings TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS ai_service_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_name TEXT,
    service_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    default_url TEXT,
    preset_models TEXT,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS style_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    prompt TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (value)
  )`,

  `CREATE TABLE IF NOT EXISTS sys_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    storyboard_id INTEGER,
    drama_id INTEGER,
    scene_id INTEGER,
    character_id INTEGER,
    prop_id INTEGER,
    provider TEXT,
    prompt TEXT,
    model TEXT,
    params TEXT,
    task_id TEXT,
    result_url TEXT,
    local_path TEXT,
    status TEXT DEFAULT 'processing',
    error_msg TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sys_task_type ON sys_task (type)`,
  `CREATE INDEX IF NOT EXISTS idx_sys_task_drama_id ON sys_task (drama_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sys_task_storyboard_id ON sys_task (storyboard_id)`,

  `CREATE TABLE IF NOT EXISTS video_merges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER,
    drama_id INTEGER,
    title TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    scenes TEXT,
    merged_url TEXT,
    duration INTEGER,
    task_id TEXT,
    error_msg TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS props (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    prompt TEXT,
    final_prompt TEXT,
    image_url TEXT,
    reference_images TEXT,
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER,
    episode_id INTEGER,
    storyboard_id INTEGER,
    storyboard_num INTEGER,
    name TEXT,
    description TEXT,
    type TEXT,
    category TEXT,
    url TEXT,
    thumbnail_url TEXT,
    local_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    format TEXT,
    image_gen_id INTEGER,
    video_gen_id INTEGER,
    is_favorite INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  // App-level global settings (key-value, e.g. content_language for AI content language)
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS production_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    total_episodes INTEGER NOT NULL,
    phase TEXT NOT NULL DEFAULT 'scripts',
    status TEXT NOT NULL DEFAULT 'running',
    stage_detail TEXT,
    config TEXT,
    approved_at TEXT,
    error_msg TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_production_jobs_drama_id ON production_jobs (drama_id)`,

  `CREATE TABLE IF NOT EXISTS synopsis_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    idea TEXT NOT NULL,
    title TEXT,
    genre TEXT,
    style TEXT,
    aspect_ratio TEXT DEFAULT '16:9',
    synopsis TEXT,
    description TEXT,
    tags TEXT,
    cover_prompt TEXT,
    status TEXT DEFAULT 'draft',
    error_msg TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_synopsis_drafts_user_id ON synopsis_drafts (user_id)`,

  `CREATE TABLE IF NOT EXISTS publish_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    display_name TEXT NOT NULL,
    client_id TEXT,
    client_secret TEXT,
    scopes TEXT,
    auth_url TEXT,
    token_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (provider)
  )`,

  `CREATE TABLE IF NOT EXISTS publish_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    provider_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    account_label TEXT,
    channel_name TEXT,
    channel_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_publish_accounts_user_id ON publish_accounts (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_publish_accounts_provider_id ON publish_accounts (provider_id)`,

  `CREATE TABLE IF NOT EXISTS publish_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    drama_id INTEGER,
    episode_id INTEGER,
    provider TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    tags TEXT,
    video_path TEXT,
    thumbnail_path TEXT,
    status TEXT DEFAULT 'pending',
    platform_video_id TEXT,
    platform_url TEXT,
    error_msg TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_publish_jobs_user_id ON publish_jobs (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_publish_jobs_episode_id ON publish_jobs (episode_id)`,
]

/**
 * Style preset seed data - value stored in dramas.style, prompt injected as image generation prompt (prepended)
 *
 * prompt written uniformly with multi-dimension structure, ensuring cross-model/cross-shot style control:
 *   core media & rendering -> line/shape -> coloring/material -> lighting -> color tone -> background treatment -> quality assurance -> avoid items
 */
export const stylePresetSeeds = [
  {
    name: '3D Comic Drama', value: '3d', sortOrder: 1,
    prompt: 'high-quality 3D CG animation still, modern game-engine cinematic render, Unreal Engine and Pixar grade quality, semi-realistic stylized characters with refined facial features, clean sculpted anatomy, detailed skin shader with subtle subsurface scattering, PBR materials with crisp detailed textures, volumetric cinematic lighting with soft rim light, rich depth of field, polished film color grading, detailed environment art, sharp focus, consistent character design across shots, avoid flat lighting, avoid plastic waxy skin, avoid low-poly blurry look, avoid 2D flat cel shading, avoid anime line art',
    description: 'Game-engine grade 3D render, semi-realistic characters, mainstream 3D short-drama look',
  },
  {
    name: 'Anime Cel-Shaded', value: 'anime', sortOrder: 2,
    prompt: 'Japanese TV anime style, clean cel shading with hard-edged shadow shapes, crisp uniform black line art, vivid saturated color palette, expressive large-eyed character design with on-model proportions, detailed hand-painted anime backgrounds, dramatic anime key lighting with screentone highlights, key-visual poster quality, consistent character design across shots, avoid 3D CGI look, avoid painterly soft blending, avoid watercolor texture, avoid photorealism, avoid thick western comic outlines',
    description: 'Japanese cel-shaded animation style',
  },
  {
    name: 'Ghibli Hand-Drawn', value: 'ghibli', sortOrder: 3,
    prompt: 'Studio Ghibli hand-drawn animation style, soft painterly brushwork with organic hand-crafted line quality, lush warm watercolor painted backgrounds, gentle natural daylight with nostalgic warm glow, muted earthy natural color palette, whimsical cozy storybook atmosphere, subtle film-grain softness, theatrical background art quality, consistent character design across shots, avoid hard cel shading, avoid 3D render look, avoid neon over-saturated colors, avoid sharp digital edges, avoid photorealism',
    description: 'Ghibli hand-drawn healing style',
  },
  {
    name: 'Watercolor Storybook', value: 'watercolor', sortOrder: 4,
    prompt: 'delicate watercolor storybook illustration, soft translucent color washes, visible cold-press paper texture, fluid hand-painted brushstrokes with gentle pigment bleeds, light airy atmosphere, harmonious pastel palette, whimsical children book charm, loose expressive edges, consistent character design across shots, avoid bold black outlines, avoid digital airbrush look, avoid harsh contrast, avoid 3D rendering, avoid photorealism',
    description: 'Watercolor illustration texture',
  },
  {
    name: 'American Comic', value: 'comic', sortOrder: 5,
    prompt: 'Western graphic-novel comic book style, bold confident black ink outlines, halftone dot shading and screentone gradients, dynamic saturated colors with dramatic contrast, dramatic spotlight lighting, flat graphic print look, sharp inking details, dynamic cinematic composition, consistent character design across shots, avoid painterly soft blending, avoid watercolor washes, avoid photorealistic rendering, avoid 3D CGI look, avoid anime cel shading',
    description: 'American comic bold-line style',
  },
  {
    name: 'Chinese Style 2.5D', value: 'guofeng', sortOrder: 7,
    prompt: 'Chinese guofeng 2.5D illustration style, semi-realistic donghua-quality character art, elegant flowing line work, rich traditional Chinese aesthetic elements, layered ink-wash inspired atmospheric backgrounds, refined silk and fabric textures, soft luminous lighting with gentle haze, sophisticated muted jewel-tone palette, xianxia drama poster quality, consistent character design across shots, avoid flat cel shading, avoid western comic ink style, avoid photorealism, avoid plastic 3D look, avoid modern clothing and props unless specified',
    description: 'Chinese-style animation/xianxia drama look, 2.5D semi-realistic',
  },
  {
    name: 'Korean Webtoon', value: 'webtoon', sortOrder: 8,
    prompt: 'Korean webtoon manhwa style, clean digital painting with soft gradient shading, slim elegant character proportions, large expressive eyes with detailed highlights, soft glowing skin rendering, romantic dreamy lighting, modern pastel-to-vivid color palette, detailed fashion and fabric rendering, webtoon key visual quality, consistent character design across shots, avoid heavy black ink outlines, avoid halftone dots, avoid 3D render look, avoid watercolor paper texture, avoid chibi proportions',
    description: 'Korean webtoon refined coloring style',
  },
  {
    name: 'Black & White Manga', value: 'noir', sortOrder: 9,
    prompt: 'black and white manga illustration, high-contrast monochrome ink work, dynamic hatching and cross-hatching shading, bold solid blacks with dramatic negative space, screentone gray gradation, expressive confident ink linework, cinematic noir lighting, professional manga page quality, consistent character design across shots, strictly no color, avoid grayscale blur smudging, avoid painterly soft edges, avoid photorealism, avoid 3D render look',
    description: 'Black-and-white manga / noir high-contrast ink style',
  },
  {
    name: 'Modern Indonesian Film', value: 'indo_modern', sortOrder: 10,
    prompt: 'modern Indonesian feature film style, naturalistic contemporary cinematography, authentic urban Jakarta settings with everyday street life, modern concrete-and-glass cityscape under warm tropical sunlight, grounded realistic performances and expressions, contemporary wardrobe and hairstyles, subtle modern digital color grading with natural skin tones, shallow depth of field with soft city bokeh, intimate documentary-like realism, current festival-quality drama aesthetic, consistent actor appearance across shots, avoid vintage retro look, avoid over-saturated stylized palettes, avoid cartoon or anime features, avoid 3D render look, avoid plastic waxy skin',
    description: 'Modern Indonesian urban drama film look, realistic contemporary imagery',
  },
  {
    name: 'Classic Indonesian Film', value: 'indo_classic', sortOrder: 11,
    prompt: 'classic Indonesian film style from the 1970s-1980s golden era, nostalgic vintage cinema aesthetic, soft warm sepia-toned color grade with gentle amber highlights, subtle heavy film grain and slight soft focus, classic melodrama blocking and composition, traditional Indonesian kampung and rural village settings, rustic interiors with vintage wooden furniture, warm tungsten and window lighting, period-appropriate batik and retro costumes, gentle nostalgic romance atmosphere, restored film archive quality, consistent actor appearance across shots, avoid modern digital sharpness, avoid desaturated cold palettes, avoid neon colors, avoid 3D render look, avoid cartoon animation',
    description: '1970s-80s classic Indonesian film look, nostalgic film grain',
  },
  {
    name: 'Indonesian Epic', value: 'indo_epic', sortOrder: 12,
    prompt: 'epic Indonesian historical blockbuster style, grand kolosal scale of archipelago kingdoms, sweeping birds-eye and anamorphic wide shots, majestic candi temples and ancient royal palaces, ornate traditional architecture with carved stone and decorated pendopo, luxurious royal costumes with gold batik and keris details, massive battle scenes with soldier formations and dramatic smoke, golden-hour and dramatic chiaroscuro lighting, heroic regal atmosphere, rich saturated palette of gold, green and deep earth tones, cinematic VFX-scale spectacle quality, consistent actor appearance across shots, avoid small-scale indie look, avoid modern urban settings, avoid minimalist empty frames, avoid cartoon animation, avoid flat TV-serial lighting, avoid 3D render look',
    description: 'Indonesian historical epic scale, grand kingdom court and war scenes',
  },
  {
    name: 'Indonesian Teen Romance', value: 'indo_sinetron', sortOrder: 13,
    prompt: 'Indonesian sinetron teenage romance drama style, vibrant saturated tropical colors, bright cheerful modern urban Jakarta campus and hangout settings, trendy youth wardrobe and hairstyles, soft warm lighting with pastel accents, romantic glow bokeh backgrounds, high-contrast commercial TV production quality, expressive emotional close-ups, dreamy romantic montage composition, consistent actor appearance across shots, avoid dark moody tones, avoid period or vintage aesthetics, avoid documentary rawness, avoid 3D render look, avoid photorealistic cinema grit',
    description: 'Indonesian teen romance/urban idol drama look, bright and romantic colors',
  },
  {
    name: 'Indonesian Folk Horror', value: 'indo_horor', sortOrder: 14,
    prompt: 'Indonesian folk horror atmosphere, deep dark tropical forest at night with eerie moonlight, crumbling traditional haunted houses and abandoned villages, ghostly kuntilanak silhouettes and floating spectral figures, candlelit ritual scenes with incense smoke, unsettling wide-angle compositions with deep shadows, cold desaturated green and blue tones with occasional sickly yellow highlights, dim single-source practical lighting, oppressive claustrophobic framing, convincing supernatural visual effects, consistent actor appearance across shots, avoid bright colorful palettes, avoid romantic warm glow, avoid comedy horror campiness, avoid 3D render look, avoid photorealistic urban settings',
    description: 'Indonesian folk/supernatural horror style, dark jungle and ghostly shadows',
  },
  {
    name: 'Indonesian Independence Era', value: 'indo_perjuangan', sortOrder: 15,
    prompt: 'Indonesian 1945 independence struggle era drama, authentic wartime uniforms and pakaian perjuangan with worn cotton and leather textures, bamboo spear and vintage rifle props, Indonesian rural villages and colonial-era Dutch architecture, morning golden-hour light filtering through tropical trees, warm earthy sepia-tinged color grade with natural film grain, patriotic solemn emotional atmosphere, grainy textured composition with shallow depth of field, heroic group formation scenes, consistent actor appearance across shots, avoid modern infrastructure or vehicles, avoid neon saturated colors, avoid anime or cartoon rendering, avoid 3D render look, avoid minimalist empty staging',
    description: 'Indonesian 1945 revolution/independence war era, simple and heroic',
  },
]

/**
 * Legacy prompt seeds (v1 one-sentence style descriptions) - for in-place content upgrade:
 * Only overwrite with new prompt if DB row prompt still matches old seed value (not edited by user in settings)
 */
const LEGACY_SEED_PROMPTS: Record<string, string> = {
  '3d': '3D CG animation style, game-engine quality render, semi-realistic stylized characters, refined facial features, detailed materials and textures, cinematic lighting, high detail',
  anime: 'Japanese anime style, cel shading, clean crisp line art, vivid saturated colors, expressive character designs, detailed painted backgrounds',
  ghibli: 'Studio Ghibli style, hand-drawn animation, soft watercolor painted backgrounds, warm nostalgic lighting, gentle natural palette, whimsical cozy atmosphere',
  watercolor: 'watercolor illustration style, soft translucent washes, visible paper texture, delicate fluid brushwork, light airy atmosphere, hand-painted storybook feel',
  comic: 'Western comic book style, bold black ink outlines, halftone dot shading, dynamic saturated colors, dramatic contrast lighting, flat graphic novel look',
}

/**
 * Removed seed presets - in-place content removal: only delete if DB row prompt still matches original seed text
 * (not edited by user); rows with same name edited by user are treated as user data and kept.
 * live (human realism): real human imagery did not pass platform content audit, removed.
 */
const REMOVED_SEED_PROMPTS: Record<string, string> = {
  live: 'ultra-realistic cinematic live-action look, professional film photography, natural skin tones with detailed pores and realistic texture, true human anatomy and proportions, shallow depth of field with creamy bokeh, cinematic three-point lighting, subtle film grain, 35mm lens cinematic framing, true-to-life color grading, detailed real-world environments, consistent actor appearance across shots, avoid cartoon or anime features, avoid 3D render look, avoid illustration style, avoid plastic waxy skin, avoid over-smoothing beauty filter',
}

// INSERT ... SELECT WHERE NOT EXISTS -> idempotent: only add missing rows, do not overwrite user edits
// (SQLite has no FROM DUAL, SELECT without FROM is valid)
const SEED_SQL = 'INSERT INTO style_presets ("name", "value", "prompt", "description", "sort_order", "is_active", "created_at", "updated_at") SELECT ?, ?, ?, ?, ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM style_presets WHERE value = ?)'
// In-place content upgrade: only update if matches old seed original text (user-edited rows unchanged)
const UPGRADE_SQL = 'UPDATE style_presets SET "name" = ?, "prompt" = ?, "description" = ?, "sort_order" = ?, "updated_at" = ? WHERE "value" = ? AND "prompt" = ?'
// In-place content removal: only delete if matches removed seed original text
const REMOVE_SQL = 'DELETE FROM style_presets WHERE "value" = ? AND "prompt" = ?'

export function initSqliteSchema(sqlite: Database.Database) {
  for (const statement of sqliteSchemaStatements) {
    sqlite.exec(statement)
  }
  const insertSeed = sqlite.prepare(SEED_SQL)
  const upgradeSeed = sqlite.prepare(UPGRADE_SQL)
  const removeSeed = sqlite.prepare(REMOVE_SQL)
  for (const s of stylePresetSeeds) {
    const ts = new Date().toISOString()
    insertSeed.run(s.name, s.value, s.prompt, s.description, s.sortOrder, ts, ts, s.value)
    const legacyPrompt = LEGACY_SEED_PROMPTS[s.value]
    if (legacyPrompt) {
      const res = upgradeSeed.run(s.name, s.prompt, s.description, s.sortOrder, ts, s.value, legacyPrompt)
      if (res.changes > 0) console.log(`🎨 Preset gaya "${s.name}" telah di-upgrade ke prompt terstruktur`)
    }
  }
  for (const [value, prompt] of Object.entries(REMOVED_SEED_PROMPTS)) {
    const res = removeSeed.run(value, prompt)
    if (res.changes > 0) console.log(`🗑️ Preset gaya "${value}" telah diarsipkan`)
  }

  // Bahasa konten AI default Bahasa Indonesia untuk instalasi baru/upgrade yang belum pernah menyetel (idempoten)
  sqlite.prepare(
    'INSERT INTO app_settings ("key", "value", "updated_at") SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE "key" = ?)'
  ).run('content_language', 'id', new Date().toISOString(), 'content_language')

  // Seed penyedia publikasi sosial (kredensial diisi pengguna lalu; idempoten)
  const seedPublishProvider = sqlite.prepare(
    'INSERT INTO publish_providers ("provider", "display_name", "scopes", "is_active", "created_at", "updated_at") SELECT ?, ?, ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM publish_providers WHERE "provider" = ?)'
  )
  const ts = new Date().toISOString()
  seedPublishProvider.run('youtube', 'YouTube', 'https://www.googleapis.com/auth/youtube.upload,https://www.googleapis.com/auth/youtube', ts, ts, 'youtube')
  seedPublishProvider.run('tiktok', 'TikTok', 'user.info.basic,video.publish,video.upload', ts, ts, 'tiktok')
  seedPublishProvider.run('meta', 'Facebook / Instagram', 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish', ts, ts, 'meta')

  // Migrasi DB lama: tambah kolom synopsis pada dramas jika belum ada (SQLite tidak mendukung ADD COLUMN IF NOT EXISTS)
  const dramaCols = sqlite.prepare('PRAGMA table_info(dramas)').all() as { name: string }[]
  if (!dramaCols.some(col => col.name === 'synopsis')) {
    sqlite.exec('ALTER TABLE dramas ADD COLUMN synopsis TEXT')
    console.log('📚 Kolom "dramas.synopsis" telah ditambahkan (migrasi otomatis)')
  }
  // Migrasi DB lama: tambah kolom user_id pada dramas untuk pemilik konten (admin multi-pengguna)
  const dramaColsV2 = sqlite.prepare('PRAGMA table_info(dramas)').all() as { name: string }[]
  if (!dramaColsV2.some(col => col.name === 'user_id')) {
    sqlite.exec('ALTER TABLE dramas ADD COLUMN user_id INTEGER')
    console.log('👤 Kolom "dramas.user_id" telah ditambahkan (migrasi otomatis)')
  }
}
