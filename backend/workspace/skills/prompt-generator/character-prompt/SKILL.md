---
name: character-prompt
description: Spesifikasi prompt karakter akhir — close-up wajah depan + tiga-tampilan turnaround (depan / samping 90 derajat / belakang), berfungsi sebagai jangkar penampilan untuk semua pembuatan berikutnya
---

# Prompt Karakter Akhir (kiri: close-up wajah depan + kanan: tiga-tampilan turnaround)

Yang dihasilkan adalah lembar referensi karakter dengan komposisi tetap:

- **Kiri: close-up wajah depan** — tampilan close-up frontal kepala dan bahu, dengan fitur wajah, potongan rambut, dan tekstur kulit yang jelas terlihat, berfungsi sebagai jangkar keterbacaan wajah
- **Kanan: tiga tampilan tubuh penuh setinggi dalam baris berdampingan — depan, samping 90 derajat, dan belakang** — tiga tampilan tubuh penuh karakter yang sama setinggi, dengan bagian atas kepala dan telapak kaki sejajar

**Prinsip inti: konsistensi > keindahan.** Gambar ini adalah jangkar penampilan untuk semua gambar karakter dan referensi video berikutnya; harus netral, jelas, dan dapat digunakan kembali — jangan mengejar keartistikan gambar tunggal.

## Struktur Output (susun satu bagian koheren dalam urutan ini, mengikuti direktif bahasa sesi)

```
Lembar referensi karakter, sisi kiri close-up wajah depan, sisi kanan tiga tampilan tubuh penuh setinggi
berdampingan menampilkan depan, samping 90 derajat, dan belakang;
close-up dan tampilan tubuh penuh adalah karakter yang sama, tubuh penuh dalam frame, pose-A netral,
tiga tampilan tubuh penuh setinggi, berdampingan, bagian atas kepala dan telapak kaki sejajar;
[kesan usia + kesan jenis kelamin + postur], [fitur wajah], [potongan rambut], [pakaian + aksesori];
wajah, potongan rambut, dan pakaian close-up wajah depan dan tiga tampilan identik sepenuhnya;
latar belakang putih bersih, pencahayaan merata lembut, kualitas sinematik
```

## Aturan Urutan Deskripsi

Dahulukan **fitur paling dapat dikenali**, mencakup setiap elemen kunci dari `appearance` (penampilan) dan `styling` (rambut/pakaian/riasan) dalam urutan ini, tanpa ada yang dihilangkan:

1. Jangkar identitas: kesan usia (misalnya "awal dua puluhan"), kesan jenis kelamin, postur (tinggi dan badan, kebiasaan postur)
2. Fitur wajah: bentuk wajah, mata, fitur notable lainnya (bekas luka, tahi lalat, kacamata, dll.) — close-up wajah depan sangat bergantung pada bagian ini
3. Potongan rambut: warna, panjang, gaya
4. Pakaian: gaya, warna, material, kondisi (misalnya "seragam kerja kusut dengan bekas solder di manset")
5. Aksesori: tulis hanya yang dapat dikenali; jangan menumpuk terlalu banyak

Ubah sifat kepribadian karakter menjadi deskripsi pembawaan dan ekspresi (misalnya "kurus kering" → "mata lelah, bahu sedikit bungkuk"); kata-kata kepribadian tidak boleh muncul langsung.

## Komposisi & Konsistensi

- Close-up wajah depan kiri: menghadap kamera langsung, ekspresi netral, kepala hingga bahu sepenuhnya dalam frame
- Tiga tampilan tubuh penuh kanan: depan, samping 90 derajat, dan belakang dari karakter yang sama, **setinggi, berdampingan, berjarak merata**, bagian atas kepala dan telapak kaki pada garis horizontal yang sama
- Close-up dan tiga tampilan tubuh penuh harus memiliki wajah, potongan rambut, dan pakaian yang sama — nyatakan secara eksplisit "wajah, potongan rambut, dan pakaian close-up wajah depan dan tiga tampilan tubuh penuh identik sepenuhnya"
- Postur netral, ekspresi alami — mudah digunakan kembali sebagai gambar referensi
- Pencahayaan studio merata dan lembut; tanpa cahaya dan bayangan dramatis (gambar referensi harus bekerja di setiap jenis adegan)
- Jangan mencampur kata-kata yang tidak relevan ke dalam output

## Larangan

- Pose dinamis, ekspresi berlebihan, properti di tangan, bersama orang lain dalam frame
- Memotong tubuh (tampilan tubuh penuh harus tubuh penuh, kepala hingga telapak kaki sepenuhnya dalam frame; close-up harus memiliki kepala dan bahu sepenuhnya dalam frame)
- Teks, label, tanda air, tanda tangan
- Bayangan berat, pencahayaan latar berwarna, properti latar belakang

## Menyimpan

Panggil `save_character_final_prompt`: parameter prompt tidak mengandung kata-kata gaya — **gaya visual proyek secara otomatis disuntikkan oleh tool di bagian paling depan prompt akhir**.
