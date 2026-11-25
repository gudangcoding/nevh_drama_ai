---
name: prop-prompt
description: Spesifikasi prompt properti akhir — still life item tunggal berlatar belakang putih, sudut pandang fotografi produk standar: proporsi akurat, tepi lengkap, latar belakang tidak memuat narasi
---

# Prompt Properti Akhir (item tunggal berlatar belakang putih · fotografi produk standar)

Yang dihasilkan adalah foto produk berlatar belakang putih: **menggunakan sudut pandang fotografi produk standar**, frame hanya berisi properti itu sendiri, ditempatkan secara terisolasi di atas latar belakang putih bersih, **tanpa elemen lain yang tercampur** — tanpa objek lain, tanpa orang, tanpa lingkungan adegan, tanpa tangan yang memegangnya.

Tiga persyaratan keras:
1. **Proporsi akurat semua bagian item** — tanpa berlebihan, distorsi, atau peregangan bergaya; hubungan ukuran relatif properti harus benar
2. **Tepi lengkap** — properti sepenuhnya dalam frame secara utuh, dengan margin di semua sisi; tidak ada bagian yang dipotong oleh tepi frame
3. **Latar belakang tidak memuat konten naratif** — latar belakang putih bersih hanya sebagai pelapis, tanpa rasa tempat, tanpa petunjuk plot, tanpa elemen dekoratif

## Struktur Output (susun satu bagian koheren dalam urutan ini, mengikuti direktif bahasa sesi)

```
Foto produk item tunggal, sudut pandang fotografi produk standar,
[nama properti + material/warna/bentuk/ukuran + detail keausan dan kerusakan];
proporsi akurat semua bagian, ditempatkan secara terisolasi di atas latar belakang putih bersih,
terpusat dan sepenuhnya dalam frame, tepi lengkap tanpa pemotongan;
latar belakang bersih dan tidak memuat konten naratif, tanpa objek lain, tanpa orang, tanpa adegan;
cahaya studio merata lembut, bayangan samar, detail tinggi
```

## Aturan Pembuatan

- Bangun di sekitar `name` dan `description` (penampilan fisik) properti: material, warna, bentuk, ukuran, tingkat keausan, tanda kerusakan, dan detail fisik lainnya harus **dibawa serta satu per satu** — itulah sumber keterbacaan properti
- Sudut pandang fotografi produk standar: tampilan 3/4 sudut sedikit tinggi (menampilkan bagian atas dan sisi untuk dimensionalitas maksimal); properti datar (kertas, kartu identitas, foto) menggunakan flat lay lurus dari atas
- Sajikan item tunggal terpusat dan lengkap, dengan margin di semua sisi, proporsi akurat, tepi lengkap — jangan memotong badan properti
- Cahaya studio merata lembut, bayangan samar, detail tinggi
- Deskripsikan hanya item itu sendiri; jangan menyebut plot, karakter, atau penggunaan (baik latar belakang maupun frame tidak memuat konten naratif)
- Jangan mencampur kata-kata yang tidak relevan ke dalam output; **jangan** menggunakan kata-kata bergaya "kualitas sinematik" (gambar properti adalah foto produk, bukan still film)

## Larangan

- Tangan yang memegangnya, orang, objek lain, atau lingkungan adegan dalam frame
- Kemasan, alas, stand display (kecuali itu adalah bagian dari properti itu sendiri)
- Teks, tanda air, tanda tangan (teks dan grafik yang dicetak pada properti itu sendiri boleh disimpan dan dideskripsikan)
- Refleksi lingkungan, cahaya berwarna
- Perspektif berlebihan, distorsi, kesalahan proporsi, pemotongan tepi

## Menyimpan

Panggil `save_prop_final_prompt`: parameter prompt tidak mengandung kata-kata gaya — **gaya visual proyek secara otomatis disuntikkan oleh tool di bagian paling depan prompt akhir**.
