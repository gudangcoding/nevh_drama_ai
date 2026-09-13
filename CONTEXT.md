# Work Context

## Objective
- **FIX SUBYEK LAMBAT/GAGAL/BOROS TOKEN pada pipeline produksi aset gambar dan video** (user: "mengapa proses membuat gambar aset lambat dan sering gagal, serta banyak menghabiskan token, jangan-jangan yang video juga gagal buat video dan lambat, cek dan perbaiki"). Perbaikan sudah selesai & terverifikasi (TSC/test/build); belum di-commit.
- Sebelumnya: semua todo asli (model-auto, efisiensi token, pipeline tahan banting, antrian, synopsis frontend, build + bump versi) sudah selesai.

## Important Details
- Branch: `auto_episode`; HEAD = `8dd1cd3 optimasi agen aset` (backend + frontend-fit dari todo model-auto/synopsis sudah terkomit); working tree (uncommitted) = semua perubahan **perf ini** (agent-timeout.ts, production/final-prompt/extraction/video-prompts/agent/synopsis/publish) + sisa bump versi & 5 locale + index.vue.
- Versi: root & backend `1.1.0`, desktop `5.1.0`; `HUOBAO_VERSION` hanya untuk build Docker.
- Build: backend `npm run build` (tsc) ✓ sesudah perubahan perf. Frontend nuxt generate ✓ (session lalu). Tests backend: 64 → **49 pass / 15 fail pre-existing** (structural `.mjs`; `node --test "tests/*.test.mjs"` di `backend/`).
- Env baru untuk timeout agent: `AI_AGENT_BASE_TIMEOUT_MS` (default 180_000), `AI_AGENT_STEP_TIMEOUT_MS` (45_000/langkah), `AI_AGENT_MAX_TIMEOUT_MS` (3_600_000). Rumus `min(base + maxSteps*step, max)`.
- Dukungan opsi `abortSignal` pada Mastra `agent.generate` dikonfirmasi di `backend/node_modules/@mastra/core/dist/agent/agent.types.d.ts` (line 358-363, 402-409, 708).
- yg GAGAL sesi ini: tidak ada.

## Work State
### Completed (perubahan perf — working tree)
- `utils/agent-timeout.ts` (baru): `agentTimeoutMs(maxSteps)`, `agentAbortSignal(maxSteps)` (AbortSignal.timeout), `isAgentTimeoutAbort(err)` (deteksi TimeoutError milik sendiri; dipakai agar sesi agent yang di-abort karena timeout TIDAK di-retry dari langkah 0 — retry hanya membakar token, cukup mark gagal + resume).
- `services/production.ts`:
  - `runAgentSilent` pasang `abortSignal: agentAbortSignal(maxSteps)`; catch: bila `isAgentTimeoutAbort(err)` → langsung throw (tanpa retry), selain itu retry transient seperti biasa.
  - `doAssetImages` di-refactor: prompt akhir aset dibuat **BATCH 1 sesi Agent** (bukan 1 sesi per aset → hemat token & waktu besar untuk 15+ aset); setelah batch, re-select rows dari DB untuk memakai `finalPrompt` yang baru tersimpan, sisanya pakai `defaultPrompt` lokal; bug counter `done` (-1 + increment ganda) dihilangkan → `let done = 0` + single increment.
  - `AssetImageItem` diubah: `ensurePrompt` dihapus, diganti `{ kind, id, label, finalPrompt, defaultPrompt }`.
- `services/final-prompt.ts`: `runPromptAgent` diberi `maxSteps` param + `abortSignal`; tambah `ensureBatchFinalPrompts(episodeId, dramaId, items[], opts?)` — satu sesi `prompt_generator` (maxSteps `min(40, 4 + missing*2)`) menulis final_prompt untuk semua aset yg belum punya; kegagalan agent ditangkap & di-log, tidak dilempar (pemanggil tinggal fallback lokal). `ensureCharacter/Scene/PropFinalPrompt` tetap ada untuk rute manual.
- Timeout dipasang di semua pemanggilan `agent.generate` lain: `extraction.ts` (maxSteps 20), `video-prompts.ts` (maxSteps 8 — video prompt agent per segment tidak hang lagi), `routes/synopsis.ts` (20), `routes/agent.ts` (20), `services/publish/index.ts` (5).
- Verifikasi: TSC bersih, test 49/64 (15 pre-existing gagal), build backend sukses.

### Active
- Tidak ada; tinggal commit setelah pengguna bersedia.

### Blocked
- 15 test structural pre-existing gagal (regex kedaluwarsa dari refactor lama) — tidak disentuh, butuh keputusan terpisah.
- 3 error tsc frontend pre-existing (useToast.ts:13, useUnifiedLanguage.ts:12, nuxt.config.ts:1).
- Belum ada observasi runtime nyata provider milik user (error 余额不足 hanya muncul di `tmp_backend2.log` saat uji coba; itu murni masalah saldo/kuota, bukan kode).

## Next Move
- Commit working tree (pesan gaya repo, mis. `perf: timeout agent + batch prompt akhir aset, hemat token & cegah hang`).
- Rekomendasi uji: jalankan produksi pada ~10+ episode; pantau `production_jobs.phase='asset_images'` → seharusnya 1 sesi prompt batch cepat lalu ≤2 gambar paralel; bila gagal, `cm` + resume. Log aktivitas task di task-logger.
- Untuk rilis Docker: `docker buildx build --build-arg HUOBAO_VERSION=1.1.0 ...`.

## Relevant Files
- `backend/src/utils/agent-timeout.ts`: helper timeout agent (baru).
- `backend/src/services/production.ts`: `runAgentSilent` (abortSignal + no-retry-on-timeout), `doAssetImages` (batch + counter fix).
- `backend/src/services/final-prompt.ts`: `ensureBatchFinalPrompts` (baru, batch 1 sesi) + `runPromptAgent` timeout.
- `backend/src/services/extraction.ts`, `video-prompts.ts`, `routes/synopsis.ts`, `routes/agent.ts`, `services/publish/index.ts`: pemanggilan agent kini ber-abortSignal.
- `frontend/app/pages/index.vue` + `locales/{id,en,ja,ko,zh}.json`: fitur synopsis selesai (working tree).
- `frontend/app/composables/useApi.ts`: `synopsisAPI.generate` (line 67-70).
- `backend/tests/production-job-structure.test.mjs`: asersi collectPhaseErrors (tetap cocok).
- `backend/node_modules/@mastra/core/dist/agent/agent.types.d.ts`: bukti opsi `abortSignal`.
- `package.json` (root/backend/desktop): 1.1.0 / 1.1.0 / 5.1.0.