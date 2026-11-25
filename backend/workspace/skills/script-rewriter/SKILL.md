---
name: script-rewriter
description: Metodologi dan aturan untuk menulis ulang novel menjadi skrip terformat
---

# Panduan Penulisan Ulang Skrip

## Prinsip Penulisan Ulang

1. **Pertahankan plot inti**: jangan ubah alur cerita utama atau hubungan antar karakter
2. **Perkuat kualitas visual**: ubah prosa naratif menjadi deskripsi adegan yang dapat divisualisasikan
3. **Digerakkan dialog**: gunakan dialog untuk memajukan plot dan kurangi narasi
4. **Kontrol pacing**: jaga setiap adegan di 30-60 detik, cocok untuk video pendek
5. **Tanpa bahasa kamera**: tidak ada ukuran shot, sudut, atau gerakan kamera — itu milik langkah breakdown storyboard

## Format Skrip Terformat

```
## S01 | INT · Kedai Kopi | Senja

Cahaya senja mengalir melalui jendela lantai-ke-langit-langit ke dalam kedai kopi; uap mengepul dari cangkir kopi di konter.

Xiaoming duduk sendirian di pojok, kepala menunduk menatap ponselnya, terlihat agak cemas.

Bel pintu berbunyi saat Xiaohong mendorong pintu masuk. Dia melihat Xiaoming dan berjalan mendekat dengan senyuman.

Xiaohong: (tersenyum) Sudah lama menunggu?
Xiaoming: (mendongak) Tidak, baru sampai.
```

### Aturan Format

- `## S<nomor> | INT/EXT · Lokasi | Periode waktu` — heading adegan
- Deskripsi aksi dalam paragraf alami — tanpa bahasa kamera jenis apa pun
- `NamaKarakter: (kondisi/ekspresi) isi dialog` — format dialog

### Referensi Volume Konten

Skrip terformat sekitar 20-30% lebih panjang dari konten asli; peningkatan terutama berasal dari penanda heading adegan dan format dialog, bukan dari penulisan ekspansi.

## Langkah Penulisan Ulang

1. Pertama panggil `read_episode_script` untuk membaca konten asli
2. Analisis struktur konten (proporsi dialog, narasi, dan monolog batin)
3. Panggil `rewrite_to_screenplay` untuk melakukan penulisan ulang
4. Periksa hasil penulisan ulang dan konfirmasi sesuai dengan format skrip terformat
5. Panggil `save_script` untuk menyimpan hasil akhir

## Catatan

- Monolog batin dapat diubah menjadi ekspresi/tindakan karakter atau voice-over
- Pecah bagian narasi panjang menjadi beberapa adegan pendek
- Pastikan setiap adegan memiliki titik balik emosi yang jelas
- Jaga konsistensi gaya bahasa setiap karakter
- Nomor adegan meningkat secara berurutan (S01, S02, S03...)
- Periode waktu harus spesifik (senja, larut malam, dini hari) — jangan tulis "siang hari" yang samar
