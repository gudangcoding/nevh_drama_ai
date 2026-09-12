---
name: storyboard-breaker
description: Aturan profesional untuk breakdown storyboard — memecah skrip menjadi segmen storyboard yang masing-masing memuat beberapa sub-shot
---

# Panduan Breakdown Storyboard

## Definisi Inti: Segmen Storyboard

Satu storyboard = satu **segmen storyboard** = satu tugas pembuatan video.

- Setiap segmen berdurasi **8-15 detik** dan secara internal memiliki **2-4 sub-shot**
- Pemotongan antar sub-shot **diperbolehkan**: ganti ukuran shot, sudut, atau subjek, disambung dengan hard cut
- Sub-shot **tidak pernah melintasi adegan**: satu segmen berlangsung di satu adegan (`scene_id` adalah ikatan tingkat segmen)
- Setiap sub-shot berdurasi 2-6 detik, fokus pada satu unit visual (satu tindakan, satu reaksi, satu close-up)

## Proses Breakdown (Empat Langkah)

1. Panggil `read_storyboard_context` untuk membaca skrip, karakter, adegan, properti, dan ringkasan storyboard yang sudah ada
2. **Identifikasi beat**: pertama identifikasi beat naratif skrip — penanda seperti [Pembuka] [Pemicu] [Klimaks] [Resolusi], atau titik balik naratif (perubahan lokasi, pengungkapan aturan, ledakan emosi, pembalikan). **Batas beat memaksa pemotongan segmen**; kelompokkan sub-shot dalam beat yang sama ke segmen yang sama jika memungkinkan, dan jangan menyebarkan rantai kausal (setup-kejadian-reaksi) ke segmen berbeda
3. **Penahan volume total**: target total durasi = jumlah karakter skrip ÷ 500 karakter/menit; jumlah segmen ≈ target total durasi ÷ 12 detik, dengan toleransi ±20%. Jangan secara signifikan melebihi atau kekurangan
4. **Pecah sub-shot dalam setiap segmen**: potong sub-shot di titik perubahan aksi, titik perubahan sudut pandang, dan titik perubahan subjek; setelah mengisi semua bidang untuk setiap segmen, panggil `save_storyboards` untuk menyimpannya sekaligus

## Durasi Tingkatan Pacing

Tentukan durasi berdasarkan fungsi segmen — jangan gunakan satu ukuran untuk semua:

| Jenis segmen | Durasi | Catatan |
|---|---|---|
| Segmen transisi | 8-10 d | Perjalanan, empty shot, penetapan lingkungan, transisi |
| Segmen naratif | 10-15 d | Kemajuan plot reguler, dialog |
| Segmen payoff | 12-15 d | Close-up, pengungkapan aturan, ledakan emosi, pembalikan; pacing sub-shot lebih lambat, satu sub-shot bisa bertahan 4-6 d |

## Lantai Durasi Dialog (Aturan Keras)

**Durasi segmen ≥ jumlah total karakter dialog dan narasi dalam segmen (bagian yang ditulis dalam deskripsi) ÷ 4,5 karakter/detik + 2 detik ruang performa**

Dialog yang tidak muat harus dipindahkan ke segmen berikutnya; menjejalkan dialog yang tidak dapat dilakukan ke dalam satu segmen tidak diperbolehkan.

## Elemen Shot

1. **Judul shot**: ringkasan 3-5 karakter dari konten inti segmen (misalnya "Mimpi Buruk Terbangun")
2. **Waktu**: waktu spesifik dalam sehari + deskripsi pencahayaan
3. **Lokasi**: deskripsi adegan lengkap + tata ruang + detail lingkungan
4. **Ukuran shot**: ukuran shot dominan dari segmen; untuk segmen multi-ukuran tulis kombinasi, misalnya "medium shot + close-up"
5. **Sudut**: setinggi mata / sudut rendah / sudut tinggi / samping / belakang
6. **Gerakan kamera**: statis / push-in / pull-back / pan / tracking / dolly (sub-shot berbeda dalam satu segmen boleh berbeda)
7. **Deskripsi visual** `description`: jelaskan sub-shot demi sub-shot sebagai `【Shot1】…【Shot2】…` apa yang benar-benar dilihat dan didengar penonton — visual (siapa + tindakan spesifik + detail bahasa tubuh + ekspresi) didahulukan; ketika sub-shot memiliki dialog, tulis di dalam `【ShotN】` yang sesuai sebagai "NamaKarakter berkata: "dialog"", dan narasi sebagai "Narasi: konten"
8. **Hasil visual** `result`: konsekuensi langsung di akhir segmen + detail visual
9. **Atmosphere** `atmosphere`: pencahayaan + nada warna + suara + suasana keseluruhan
10. **Durasi** `duration`: total durasi segmen 8-15 detik, dan harus memenuhi lantai durasi dialog
11. **Ikatan adegan**: jika bisa dicocokkan dengan adegan yang ada, `scene_id` harus diisi
12. **Ikatan karakter**: isi `character_ids`, mengikat 0 hingga beberapa karakter yang terlibat dalam segmen ini
13. **Ikatan properti**: isi `prop_ids`, mengikat 0 hingga beberapa properti kunci yang muncul dalam segmen ini

## Aturan Ikatan Adegan

- Utamakan `scenes` yang dikembalikan oleh `read_storyboard_context`
- Ketika `lokasi + waktu` dapat dicocokkan dengan jelas, `scene_id` yang benar harus diisi
- Jangan membuat ID adegan yang tidak ada
- Jika konten skrip jelas berada dalam adegan yang sudah ada, jangan membuat deskripsi adegan baru yang duplikat

## Aturan Ikatan Karakter

- `character_ids` harus dipilih dari daftar karakter yang dikembalikan oleh `read_storyboard_context`
- Satu segmen boleh tidak memiliki karakter, atau mengikat beberapa karakter
- Karakter mana pun yang memiliki kemunculan jelas dalam segmen — terlihat, beraksi, atau berbicara — harus diikat
- Segmen lingkungan murni, empty shot, dan close-up objek boleh mengirimkan array kosong

## Aturan Ikatan Properti

- `prop_ids` harus dipilih dari daftar properti (`props`) yang dikembalikan oleh `read_storyboard_context`
- Saat properti digunakan oleh karakter, diserahterimakan, ditampilkan dalam close-up, atau terlihat jelas dalam frame dan bermakna bagi narasi, properti tersebut harus diikat ke segmen tersebut
- Segmen close-up properti (tanpa karakter) juga harus mengikat properti; `character_ids` boleh kosong
- Jangan mengikat item latar belakang atau set dressing yang tidak relevan dengan plot; segmen tanpa properti kirimkan array kosong
- Properti yang diikat berfungsi sebagai gambar referensi untuk pembuatan video (foto produk berlatar belakang putih), menjaga penampilan properti tetap konsisten di seluruh segmen

## Persyaratan Kualitas

- `description` harus dapat dibaca manusia, menjelaskan sub-shot demi sub-shot apa yang benar-benar dilihat dan didengar penonton; dialog/narasi ditulis langsung di dalam `【ShotN】` yang sesuai
- `image_prompt` harus menyoroti komposisi single-frame, penampilan karakter, lingkungan, dan pencahayaan (sesuai dengan sub-shot pertama segmen)
- `bgm_prompt` dan `sound_effect` boleh berupa frasa singkat, tetapi tidak boleh samar seperti hanya "tegang" atau "sedih"
- Untuk melakukan penyesuaian, panggil `update_storyboard` untuk memodifikasi segmen tertentu
