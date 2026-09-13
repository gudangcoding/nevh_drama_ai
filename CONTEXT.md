# Work Context

## Objective
- **TUNTAS (sesi ini):** Verifikasi & stabilkan "Buat Sinopsis"/pipeline teks yang gagal `enable_thinking` (hcnsec) lampau lambat (5 menit). Akar masalah: (1) log error user = basi dari dev server kode lama; (2) error nyata terbaru = `Headers Timeout` karena model thinking `DeepSeek-V4-Flash` sangat lambat. Fix: retry transient untuk semua pemanggilan agent + `NODE_HTTP_HEADERS_TIMEOUT` dinaikkan + auto-model memilih model cepat; config teks DB diarahkan ke model cepat. E2E terverifikasi: **305 dtk → 69 dtk**. Installer **5.1.6** siap.
- Sebelumnya: todo asli (model-auto, efisiensi token, pipeline tahan banting, antrian, synopsis frontend, build + bump) + pemisahan ini sudah selesai (8dd1cd3…489214b terkomit).

## Important Details
- Branch `auto_episode`; HEAD = `489214b` (1.1.5/5.1.5 terkomit). **Working tree = perubahan 1.1.6/5.1.6, BELUM commit**.
- Lingkungan resmi user: **app terinstal (Electron, API port 53280, DB `D:/DRAMA AI/huobao.sqlite3`, frontend `/_nuxt/DxMGjB-T.js`)**. Dev server `tsx watch` (port 5679, DB repo `data/huobao.sqlite3`) SUDAH DIMATIKAN (pohon PID 13156→12332); port 5679 bebas. Error `enable_thinking` yang ditempel user = draft id 4 di DB dev (18:24, kode lama) → **basi**.
- E2E live app terinstal (hcnsec): draft id=5 "si kancil dan buaya" **completed 305 s** (DeepSeek-V4-Flash); setelah config teks diarahkan ke model cepat → draft id=6 **completed 68.6 s** (`Qwen3.8-Flash-Next`, judgment "Kancil dan Buaya Lapar"). 
- hcnsec `/v1/models`: model fast tanpa reasoning-leak empiris = `Qwen3.8-Flash-Next` (≈4 dtk), `glm-4.5-air` (≈6 dtk), `sensenova-6.8-flash-lite` (≈5 dtk). `glm-5.3-flash`/`step-3.7-flash` → content kosong bila reasoning_effort none (ha haus token); `DeepSeek-V4-Flash` >60 dtk.
- **DB runtime (D:/DRAMA AI) diubah:** `ai_service_configs` id 19 (text, openai, hcnsec) `model = ["Qwen3.8-Flash-Next","glm-4.5-air"]` (sebelumnya `["auto"]`). Berlaku untuk sinopsis, prompt episode, aset produksi (final prompts), karakter/adegan/properti, ekstraksi, video prompts — semuanya pakai config teks aktif id 19.
- Env baru yang didokumentasikan di `backend/.env.example`: `AI_HTTP_HEADERS_TIMEOUT_MS` (default 900_000 → set `NODE_HTTP_HEADERS_TIMEOUT` di `src/index.ts`), `AI_AGENT_RETRY`/`AI_AGENT_RETRY_BACKOFF` (retry bersama), `AI_SYNOPSIS_RETRY`/`_BACKOFF` (tidak dipakai lagi — synopsis refactor ke `generateWithRetry`). Env timeout agent lama (AI_AGENT_BASE/STEP/MAX_TIMEOUT) tetap.
- Verifikasi: TSC backend ✓; `node --test` = **49 pass / 15 fail pre-existing** (structural regex); installer `desktop/release/Nevh Drama Setup 5.1.6.exe` (141 MB) dibangun; bundle `app.asar` berisi `NODE_HTTP_HEADERS_TIMEOUT`(1), `generateWithRetry`(7), `scoreChatModel`(2). Frontend tidak berubah → nuxt output lama dipakai ulang.
- Desired next app install: **5.1.6** (code baru retry/header-timeout jika ingin aktif di instalasi).

## Work State
### Completed (working tree — versi 1.1.6/5.1.6)
- Terapkan retry transient konsisten utk SEMUA pemanggilan agent via `utils/agent-retry.ts` (baru): `isTransientAgentError` (jaringan/5xx/`Headers Timeout`/timeout) + `generateWithRetry` (retry ≤2, backoff exp, **tidak** retry utk `isAgentTimeoutAbort` atau error pasti/validasi). Dipakai di: `routes/synopsis.ts`, `routes/agent.ts`, `services/final-prompt.ts` (karakter/adegan/properti/batch), `services/extraction.ts`, `services/video-prompts.ts`, `services/publish/index.ts`. `services/production.ts` `runAgentSilent` memakai `isTransientAgentError` bersama (hapus duplikat lokal).
- `services/production.ts`: juga pasang `NODE_HTTP_HEADERS_TIMEOUT` (undici) via `AI_HTTP_HEADERS_TIMEOUT_MS` di `src/index.ts` agar respons lambat-selesai tidak dibunuh di menit ke-5.
- `utils/agent-retry.ts`: tambah `readAgentUsage` + `logAgentUsage` — mencatat token input/output/reasoning/cached per run agent ke log (`Agent` scope, action `token-usage`), dipanggil di `generateWithRetry` (semua pemanggil) & `services/production.ts` `runAgentSilent`. Normalisasi shape AI SDK v4 & v5 (termasuk `inputTokens:{total,text,reasoning}`).
- `agents/index.ts` `scoreChatModel`: sekarang memprioritaskan model cepat/ekonomis `/(mini|flash|lite|small|fast|nano|air|turbo|next)/ +4`, famil i chat `+2`, bukan `+3/+1`; model media tetap `-20`. Sehingga `auto` pada hcnsec ter-resolve ke `Qwen3.8-Flash-Next` (bukan lagi DeepSeek-V4-Flash).
- Bump versi: root & backend `1.1.6`, desktop `5.1.6`. Installer 5.1.6 dibangun & dibundle terverifikasi.
- E2E app terinstal: draft id=6 completed 68.6 dtk; id=5 (sebelumnya) completed 305 dtk.

### Active
- Tidak ada; tinggal commit bila pengguna mau.

### Blocked
- 15 test structural pre-existing gagal (regex kedaluwarsa) — tidak disentuh.
- 3 error tsc frontend pre-existing (useToast.ts:13, useUnifiedLanguage.ts:12, nuxt.config.ts:1) — frontend tak disentuh.
- Dev server dihentikan; bila ingin dijalankan lagi gunakan `tsx watch src/index.ts` di `backend/` (DB terpisah `data/`).

## Next Move
- Commit working tree dengan gaya repo, mis. `perf: retry transient agent + tingkatkan header timeout + auto-model pilih model cepat; bump 1.1.6/5.1.6`.
- Instal `Nevh Drama Setup 5.1.6.exe` (atau pakai win-unpacked) agar kode retry/header-timeout aktif di app; kembali jalankan produksi multi-episode dan pantau `production_jobs.phase`.
- Catatan: config teks id 19 di `D:/DRAMA AI` sudah menunjuk ke `Qwen3.8-Flash-Next` (cepat). Bila pengguna mengganti model via UI, DB akan menimpanya.

## Relevant Files
- `backend/src/utils/agent-retry.ts` (baru): `isTransientAgentError` + `generateWithRetry`.
- `backend/src/index.ts`: set `NODE_HTTP_HEADERS_TIMEOUT` dari `AI_HTTP_HEADERS_TIMEOUT_MS`.
- `backend/src/agents/index.ts`: `scoreChatModel` diprioritaskan model cepat.
- `backend/src/routes/synopsis.ts`, `routes/agent.ts`: generate pakai `generateWithRetry`.
- `backend/src/services/final-prompt.ts`, `extraction.ts`, `video-prompts.ts`, `publish/index.ts`, `production.ts`: retry bersama / shared predicate.
- `backend/.env.example`: dokumentasi env retry & header timeout.
- `desktop/release/Nevh Drama Setup 5.1.6.exe`: installer (141 MB).
- `D:/DRAMA AI/huobao.sqlite3`: DB runtime user; config id 19 → `Qwen3.8-Flash-Next`.
- `package.json` (root/backend/desktop): 1.1.6 / 1.1.6 / 5.1.6.