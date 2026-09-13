# Work Context

## Objective
- Menyelesaikan semua todo yang tersisa (frontend "+ Buat Sinopsis", OpenAI custom base URL + model auto, efisiensi token, pipeline tahan banting, antrian produksi, verifikasi TSC + tests), lalu build dan naikkan versi proyek.

## Important Details
- Branch: `auto_episode`; HEAD = `8dd1cd3 optimasi agen aset` (berisi semua perubahan backend dari todo: agents/model-auto, aiConfigs probe, production queue/retry/collectPhaseErrors, test update — terkomit). Working tree (uncommitted): bump versi + fitur frontend.
- Versi: root & backend `1.0.0 → 1.1.0`, desktop `5.0.1 → 5.1.0`. Backend otomatis membaca versi dari `backend/package.json` (fallback `server-update.ts`); desktop update-feed memakai `desktop/package.json` version. `HUOBAO_VERSION` hanya untuk build Docker (set saat rilis image).
- Build: backend `npm run build` (tsc) ✓; frontend `npm run generate` (nuxt static) ✓; desktop `npm run build:backend` + `npm run build:main` ✓. Frontend punya 3 TS error pre-existing (useToast.ts, useUnifiedLanguage.ts, nuxt.config.ts) — bukan dari perubahan.
- Tests backend: 64 tests → 49 pass / 15 fail. 15 fail TERBUKTI pre-existing (identik di HEAD `176a077`, tidak terkait perubahan). Tests = structural `.mjs` (node:test + readFileSync regex), jalankan `node --test "tests/*.test.mjs"` di `backend/`.
- yang GAGAL di session ini: tidak ada.

## Work State
### Completed
- Backend di commit `8dd1cd3`:
  - `agents/index.ts`: model auto OpenAI-compatible (cache 10 mnt, `scoreChatModel`, `autoResolveTextModel` probe `/models`+`/v1/models` via robustFetch + timeout 15s, error bahasa Indonesia bila kosong, guard gemini — model kosong/'auto' ditolak untuk gemini).
  - `routes/aiConfigs.ts`: probe test provider teks fallback `/v1/models` → `/models` (break selain 404/400).
  - `services/production.ts`: antrian global berurutan (`enqueueRun`/`queueTail`), retry transient agent (`isTransientError`, DMA_AGENT_RETRY default 2, backoff 4000ms), `collectPhaseErrors(items|tasks, jobId, worker)` membungkus asset-images/komposisi/video dengan ringkasan "Semua|Sebagian gagal dibuat (...)", pesan storyboard di-deduplikasi (hapus charList/sceneList/propList duplikat).
  - `tests/production-job-structure.test.mjs`: asersi diupdate ke `collectPhaseErrors`.
- Frontend (working tree):
  - `pages/index.vue`: tombol `+ Buat Sinopsis` (btn-ghost + Wand2) di `head-actions` sebelah "+ Proyek Baru"; dialog sinopsis 3 state (form → loading → hasil): textarea idea + BaseSelect style/aspect_ratio → `synopsisAPI.generate` → preview (judul, genre, tag, sinopsis) → tombol "Gunakan ke Proyek Baru" mem-prefill form create + `synExtra` (description/genre/tags/cover_prompt) diteruskan lewat `dramaAPI.create`; `synLoading`/`synResult`/`synForm`/`synExtra`/`showSynopsis`; close diblok saat generating; `.syn-result`, `.syn-loading` styles.
  - Locales: blok `index.synopsis.*` ditambahkan di **id, en, ja, ko, zh** (button, buttonHint, title, desc, idea, ideaPlaceholder, ideaHint, style, aspectRatio, generate, generating, generatingHint, untitled, useDraft, drafted, errorEmpty).
- Verifikasi: `npx tsc --noEmit` backend bersih; test 49/64 pass (15 pre-existing gagal).
- Versi naik + build sukses (backend tsc, nuxt generate, desktop bundles 5.1.0).

### Active
- Tidak ada; semua todo selesai.

### Blocked
- 15 test structural pre-existing gagal (regex kedaluwarsa dari refactor lama — module `mysql-schema.ts` tak ada, prompt Cina ↔ Indonesia, dll). Tidak disentuh karena di luar scope todo; perlu keputusan terpisah bila mau difix.
- Frontend `tsc`: 3 error pre-existing (bukan dari perubahan ini).

## Next Move
- Commit working tree (8 file: 5 locales + index.vue + root/backend/desktop package.json) dengan pesan gaya repo (mis. `feat: tombol buat sinopsis + bump versi 5.1.0`).
- Opsional: jalankan `npm run dist:win` di `desktop/` untuk menghasilkan installer (berat, unduh artifact electron-builder).
- Untuk rilis Docker: `docker buildx build --build-arg HUOBAO_VERSION=1.1.0 ...`.

## Relevant Files
- `backend/src/agents/index.ts`: model auto (autoResolveTextModel/getModel).
- `backend/src/routes/aiConfigs.ts`: probe fallback `/v1/models` → `/models`.
- `backend/src/services/production.ts`: queue, retry, collectPhaseErrors, dedup storyboard message.
- `backend/tests/production-job-structure.test.mjs`: asersi collectPhaseErrors.
- `frontend/app/pages/index.vue`: tombol + dialog sinopsis, useSynopsisAsDraft, synExtra merged di `create()`.
- `frontend/app/composables/useApi.ts`: `synopsisAPI.generate` (line 67-70).
- `frontend/app/locales/{id,en,ja,ko,zh}.json`: blok `index.synopsis.*`.
- `backend/src/routes/synopsis.ts` + `db/schema.ts` (synopsisDrafts): field draft = title, genre, style, aspect_ratio, synopsis, description, tags, cover_prompt.
- `package.json` (root/backend/desktop): versi 1.1.0 / 1.1.0 / 5.1.0.