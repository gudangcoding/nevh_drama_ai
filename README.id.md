# 🎬 Huobao Drama - Platform Produksi Drama Pendek AI

<div align="center">

**Platform produksi drama pendek AI bertenaga penuh berbasis TypeScript**

[![Node Version](https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat&logo=vue.js)](https://vuejs.org)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![Unduh](https://img.shields.io/github/v/release/chatfire-AI/huobao-drama?style=flat&logo=github&label=Unduh)](https://github.com/chatfire-AI/huobao-drama/releases/latest)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | **Bahasa Indonesia**

[Fitur](#-fitur) • [Mulai Cepat](#-mulai-cepat) • [Panduan Visual](#-panduan-visual) • [Aplikasi Desktop](#-aplikasi-desktop-direkomendasikan) • [Deployment](#-deployment)

<h2>🔑 <a href="https://api.firemux.com">Dapatkan Kunci API Huobao 👉 Mulai sekarang</a></h2>

**Kemampuan AI teks, gambar, dan video — satu kunci membuka segalanya**

Setelah deployment, tempel kunci di "Pengaturan → Konfigurasi Cepat Huobao" untuk menulis tiga konfigurasi yang direkomendasikan dalam satu klik

<h3>📥 <a href="https://github.com/chatfire-AI/huobao-drama/releases/latest">Unduh Aplikasi Desktop (macOS / Windows)</a></h3>

</div>

---

## 📖 Ikhtisar

Huobao Drama adalah platform produksi drama pendek bertenaga AI yang mengotomatiskan seluruh alur kerja: pembuatan skrip, desain karakter, breakdown storyboard, dan kompositing video.

### 🎯 Nilai Utama

- **🤖 Digerakkan AI**: LLM mengurai skrip dan mengekstrak karakter, adegan, dan informasi storyboard
- **🎨 Kreasi Cerdas**: Pembuatan gambar AI untuk desain karakter dan latar adegan
- **📹 Pembuatan Video**: Model teks-ke-video dan gambar-ke-video secara otomatis memproduksi klip storyboard
- **🔄 Alur Kerja End-to-End**: Alur kerja lengkap dari ide hingga episode selesai

### 🛠️ Arsitektur

```
frontend/   — Nuxt 3 + Vue 3 + TypeScript (CSS murni, tanpa UI framework)
backend/    — Hono + Drizzle ORM + Mastra AI Agents + better-sqlite3
backend/workspace/skills/ — Definisi skill agen (SKILL.md, dapat diedit di UI)
desktop/    — Aplikasi desktop Electron (proses utama + esbuild + electron-builder dmg/exe)
data/       — Aset yang dihasilkan dan database SQLite
```

---

## ✨ Fitur

### 🎭 Manajemen Karakter

- ✅ Desain karakter yang dihasilkan AI
- ✅ Pembuatan karakter massal
- ✅ Unggah dan manajemen gambar karakter

### 🎬 Tugas Video

- ✅ Pembuatan tugas video AI otomatis
- ✅ Deskripsi adegan dan pembuatan prompt video
- ✅ Pembuatan video massal per tugas

### 🎥 Pembuatan Video

- ✅ Pembuatan teks-ke-video
- ✅ Kompositing per shot FFmpeg dan penanganan subtitle
- ✅ Penjahitan dan ekspor episode penuh

### 📦 Manajemen Aset

- ✅ Perpustakaan aset terpadu
- ✅ Dukungan penyimpanan lokal
- ✅ Pelacakan kemajuan tugas

### 🤖 Agen AI

Empat agen Mastra bawaan dengan konfigurasi berbasis database dan ekstensi Skill:

| Agen | Peran |
|---|---|
| `script_rewriter` | Penulisan ulang novel → skrip terformat |
| `extractor` | Ekstraksi cerdas dan deduplikasi karakter / adegan / properti |
| `storyboard_breaker` | Breakdown skrip → urutan storyboard |
| `prompt_generator` | Prompt gambar untuk karakter/adegan/properti + prompt video storyboard |

### 🌐 Antarmuka Multi-Bahasa

Antarmuka tersedia dalam **中文 / English / 日本語 / 한국어 / Bahasa Indonesia**, dengan pengaturan global untuk bahasa konten yang dihasilkan AI.

### 🔌 Dukungan Multi-Penyedia

| Jenis | Penyedia |
|---|---|
| **Teks** | OpenAI (API kompatibel), Gemini |
| **Gambar** | OpenAI, Gemini, Volcano Engine |
| **Video** | Volcano Engine Seedance 2.0 (Standar / Fast / Mini), MiniMax H3, Alibaba Bailian Wan 3.0 (Prime / Standar) |

---

## 🚀 Mulai Cepat

### 📋 Persyaratan

| Perangkat Lunak | Versi | Catatan |
|---|---|---|
| **Node.js** | 20+ | Runtime untuk frontend dan backend |
| **npm** | 9+ | Pengelola paket |

> **Database tanpa instalasi**: SQLite terbundel (file tunggal di direktori data proyek) — tidak diperlukan server database.
> **Tidak perlu instal FFmpeg**: Biner dikirim melalui paket npm `ffmpeg-static` / `ffprobe-static` — langsung bisa digunakan.

### ⚙️ Variabel Lingkungan

Tidak ada file konfigurasi — semuanya diatur melalui variabel lingkungan (semua memiliki default; dev lokal tidak memerlukan konfigurasi):

| Variabel | Default | Deskripsi |
|---|---|---|
| `SQLITE_PATH` | `<repo>/data/huobao.sqlite3` | Lokasi file database SQLite |
| `PORT` | `5679` | Port layanan backend |
| `STORAGE_PATH` | `<repo>/data/static` | Direktori penyimpanan file yang dihasilkan |
| `HUOBAO_DATA_DIR` | — | Disuntikkan oleh proses utama Electron (root data userData) |
| `WORKSPACE_PATH` | `backend/workspace` | Direktori skill/prompt agen (desktop: salinan yang dapat ditulis di bawah userData) |
| `FRONTEND_DIST` | `frontend/dist` | Direktori build statis frontend |
| `FFMPEG_BIN` / `FFPROBE_BIN` | biner npm terbundel | Path eksekutabel ffmpeg/ffprobe kustom |
| `PUBLIC_BASE_URL` | — | URL publik yang dibutuhkan Seedance untuk mereferensikan aset lokal (deployment server) |

> **Catatan**: Kunci API layanan AI, base URL, dan parameter model semuanya dikonfigurasi di halaman "Pengaturan" web UI dan disimpan di database — tidak pernah di file konfigurasi atau variabel lingkungan.

### 📥 Instalasi

```bash
# Klon repositori
git clone https://github.com/chatfire-AI/huobao-drama.git
cd huobao-drama

# Instal dependensi backend
cd backend && npm install

# Instal dependensi frontend
cd ../frontend && npm install
```

### 🎯 Menjalankan

#### Opsi 1: Mode pengembangan (direkomendasikan)

Frontend dan backend berjalan terpisah dengan hot reload:

```bash
# Terminal 1: backend
cd backend
npm run dev

# Terminal 2: frontend
cd frontend
npm run dev
```

- Frontend: `http://localhost:3013`
- Backend API: `http://localhost:5679/api/v1`
- Frontend secara otomatis meneruskan `/api` dan `/static` ke backend

#### Opsi 2: Mode layanan tunggal

Backend melayani API dan file statis frontend:

```bash
# 1. Build frontend
cd frontend && npm run generate

# 2. Salin output build
cp -r .output/public dist

# 3. Jalankan backend
cd ../backend && npm start
```

Kunjungi: `http://localhost:5679`

### 🔑 Penggunaan Pertama: Konfigurasi Layanan AI

Semua fitur AI (teks/gambar/video) memerlukan layanan model yang dikonfigurasi terlebih dahulu — spanduk di bagian atas halaman memandu Anda hingga selesai:

1. Buka halaman "Pengaturan"
2. Tempel kunci API Huobao Anda di "Konfigurasi Cepat Huobao" ([dapatkan di api.firemux.com](https://api.firemux.com)) untuk menulis tiga konfigurasi yang direkomendasikan (teks, gambar, video) dalam satu klik
3. Atau tambahkan penyedia satu per satu melalui "Template Manual", dengan pengujian konektivitas

Setelah dikonfigurasi, spanduk menghilang dan Anda dapat mulai memproduksi episode.

---

## 📖 Panduan Visual

Alur kerja lengkap dari novel hingga episode selesai. Panel kemajuan kiri selalu menampilkan posisi Anda saat ini.

### Langkah 1 · Buat Proyek

Di halaman beranda klik "Proyek Baru", pilih **rasio aspek** (16:9 lanskap / 9:16 potret, tetap setelah dibuat) dan **gaya visual** (3D, realistis, … — disuntikkan ke setiap prompt gambar).

### Langkah 2 · Konfigurasi Layanan AI (pertama kali)

Tempel kunci API di Pengaturan → "Konfigurasi Cepat Huobao" untuk menulis tiga konfigurasi yang direkomendasikan sekaligus, atau tambahkan penyedia secara manual.

### Langkah 3 · Tahap Skrip

Tempelkan **novel sumber** Anda ke meja kerja, lalu tekan "Tulis Ulang AI" untuk menghasilkan skrip syuting — dibagi per episode dengan adegan dan karakter yang dianotasi.

### Langkah 4 · Aset

Jalankan **ekstraksi** pada skrip untuk mendapatkan daftar karakter / adegan / properti, lalu buat gambar referensi yang konsisten untuk masing-masing (atau secara massal). Gambar-gambar ini disuntikkan sebagai materi referensi saat membuat video.

### Langkah 5 · Storyboard & Video

Di halaman "Produksi Video", pertama jalankan **breakdown storyboard** (AI membagi shot dan menulis prompt video). Kemudian:

- Pilih **model video** di bilah atas (Seedance / Wan 3.0 / MiniMax…); resolusi dan tingkat durasi mengikuti model
- Tinjau dan sesuaikan prompt setiap shot di kanan (`@karakter` secara otomatis dipetakan ke gambar referensi)
- Klik "Buat Video Massal"; tugas yang gagal dapat dicoba ulang dalam satu klik

### Langkah 6 · Gabung & Ekspor

Pilih shot (arahkan kursor untuk mempratinjau setiap klip), klik "Mulai Menggabungkan" dan FFmpeg merakit episode penuh — putar online atau unduh.

---

## 📦 Deployment

### 🖥️ Aplikasi Desktop (direkomendasikan)

**⬇️ Installer siap pakai: [GitHub Releases](https://github.com/chatfire-AI/huobao-drama/releases/latest)**

| Platform | File untuk diunduh |
|---|---|
| macOS (Apple Silicon, M-series) | `HuobaoDrama-<version>-arm64.dmg` |
| macOS (Intel) | `HuobaoDrama-<version>.dmg` |
| Windows | `HuobaoDrama Setup <version>.exe` |

Tidak perlu build — unduh dmg/exe dan instal. Klien yang terinstal diperbarui otomatis melalui updater bawaan.

### 🏭 Deployment Server

```bash
# 1. Build frontend
cd frontend && npm run generate

# 2. Salin output build
cp -r .output/public dist && cd ..

# 3. Jalankan backend
cd backend && npm start
```

### 🐳 Deployment Docker

**Opsi A — gambar siap pakai (tanpa clone, tanpa build):**

```bash
docker pull huobao/huobao-drama:4.0.0

docker run -d \
  --name huobao-drama \
  -p 5679:5679 \
  -v huobao-data:/app/data \
  --restart unless-stopped \
  huobao/huobao-drama:4.0.0
```

**Opsi B — docker compose (build sumber + pembaruan dalam aplikasi Watchtower):**

```bash
# 1. Konfigurasi lingkungan (token Watchtower)
cp .env.example .env   # edit WATCHTOWER_TOKEN

# 2. Build dan jalankan
HUOBAO_VERSION=4.0.0 docker compose up -d --build

# 3. Kunjungi http://localhost:5679
```

---

## 🎨 Tumpukan Teknologi

### Backend

- **Runtime**: Node.js 20+
- **Web framework**: Hono
- **ORM**: Drizzle ORM + better-sqlite3 (mode WAL)
- **Agen AI**: Mastra + AI SDK (kompatibel OpenAI)
- **Pemrosesan video**: FFmpeg (fluent-ffmpeg + biner terbundel)
- **Pemrosesan gambar**: Sharp

### Desktop

- **Shell**: Electron (utilityProcess meng-host backend; BrowserWindow memuat same-origin)
- **Packaging**: esbuild (bundle backend file tunggal) + electron-builder (dmg arm64/x64, NSIS win-x64)

### Frontend

- **Framework**: Nuxt 3 (mode SPA)
- **Bahasa**: Vue 3 + TypeScript
- **Routing**: Routing berbasis file (Vue Router 4)
- **Styling**: CSS murni + CSS Variables
- **Ikon**: Lucide Vue
- **i18n**: vue-i18n (中文 / English / 日本語 / 한국어 / Bahasa Indonesia)

---

## 📝 FAQ

### T: Di mana aplikasi desktop menyimpan data?

J: `~/Library/Application Support/HuobaoDrama/data/` (database SQLite + gambar/video yang dihasilkan); salinan skill yang diedit online berada di direktori `workspace/` yang berdekatan. Dalam mode pengembangan, direktori `data/` repositori digunakan.

### T: Bagaimana cara memigrasikan data MySQL lama ke SQLite?

J: Jaga MySQL tetap dapat dijangkau (variabel lingkungan atau `backend/.env`), lalu jalankan `cd backend && npx tsx scripts/import-mysql-to-sqlite.ts`. Skrip membuat tabel secara otomatis, mengimpor tabel demi tabel, dan memvalidasi jumlah baris (target yang tidak kosong memerlukan `--force`; backup dibuat sebelum menulis).

### T: FFmpeg tidak terinstal atau tidak ditemukan?

J: Tidak perlu instal. Proyek menyertakan biner `ffmpeg-static` / `ffprobe-static` (dibawa dalam paket desktop). FFmpeg sistem di `PATH` juga tidak akan konflik, dan Anda dapat menunjuk secara eksplisit melalui `FFMPEG_BIN`/`FFPROBE_BIN`.

### T: Bagian atas halaman mengatakan "Tidak ada model yang dikonfigurasi"?

J: Itu panduan deployment pertama yang normal. Pergi ke "Pengaturan" dan gunakan "Konfigurasi Cepat Huobao" untuk menempel kunci API dan menulis konfigurasi dalam satu klik, atau tambahkan penyedia melalui "Template Manual". Spanduk menghilang setelah teks, gambar, dan video semuanya memiliki konfigurasi yang diaktifkan.

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah **[CC BY-NC-SA 4.0](LICENSE)** (Atribusi-NonKomersial-BerbagiSerupa 4.0 Internasional).

- ✅ Penggunaan pribadi, pembelajaran, dan proyek non-komersial dipersilakan
- ✅ Modifikasi dan redistribusi diizinkan di bawah lisensi yang sama dengan atribusi
- ❌ **Penggunaan komersial dilarang** — Anda tidak boleh menggunakan proyek ini, seluruhnya atau sebagian, untuk tujuan komersial apa pun (termasuk layanan berbayar, deployment komersial, atau penjualan kembali) tanpa izin tertulis sebelumnya dari penulis

---

## 🤝 Berkontribusi

Masalah dan Pull Request dipersilakan!

1. Fork proyek
2. Buat branch fitur (`git checkout -b feature/FiturHebat`)
3. Commit perubahan Anda (`git commit -m 'Tambah beberapa FiturHebat'`)
4. Push ke branch (`git push origin feature/FiturHebat`)
5. Buka Pull Request

---

> _"Biarkan AI berkreasi bersama kita"_
