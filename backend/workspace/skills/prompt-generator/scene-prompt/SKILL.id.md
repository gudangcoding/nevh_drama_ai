---
name: scene-prompt
description: Spesifikasi prompt adegan akhir — establishing shot sudut lebar yang jelas: posisi relatif tetap dari latar depan/tengah/belakang/pintu masuk/lantai/dinding/set dressing kunci; ruang kontinu, konsisten, dapat digunakan kembali, tanpa orang
---

# Prompt Adegan Akhir (establishing shot sudut lebar · adegan kosong tanpa orang)

Yang dihasilkan adalah gambar adegan **establishing shot sudut lebar yang jelas**: empty shot murni dari adegan dengan **sama sekali tanpa orang**, menampilkan sepenuhnya **posisi relatif tetap dari latar depan, tengah, belakang, pintu masuk/keluar, lantai, dinding, dan set dressing kunci** — ruang kontinu, konsisten, dan dapat digunakan kembali.

Gambar ini berfungsi sebagai jangkar referensi latar belakang untuk setiap shot dalam adegan ini: penonton maupun model harus dapat membaca seluruh tata ruang dari gambar ini — di mana masuk dan keluar, seperti apa lantai dan dindingnya, dan di mana setiap set dressing kunci ditempatkan secara tetap. Sudut pandang harus stabil dan serbaguna.

## Struktur Output (susun satu bagian koheren dalam urutan ini, mengikuti direktif bahasa sesi)

```
Shot sudut lebar kamera tetap, establishing shot yang jelas, [lokasi + tekstur periode], [periode waktu];
komposisi tiga lapisan latar depan ([elemen latar depan]), tengah ([ruang utama latar tengah]),
dan belakang ([kedalaman latar belakang]);
pintu masuk/keluar ([posisi dan gaya pintu/jalur]), lantai ([material dan kondisi lantai]),
dinding ([material dan warna dinding]);
[set dressing kunci dan posisi relatif tetapnya];
struktur ruang kontinu dan konsisten;
[sumber cahaya + suhu warna + kontras kecerahan], [suasana];
Tidak ada orang dalam adegan, adegan kosong, kualitas sinematik
```

## Aturan Struktur Ruang

Ruang harus **dapat dibaca, konsisten, dan dapat digunakan kembali**:

- **Latar depan**: elemen pembingkaian/penghalang (kusen pintu, sudut meja, tanaman, tepi peralatan) yang menciptakan kedalaman — tulis 1-2 elemen spesifik
- **Latar tengah**: ruang utama adegan dan set dressing inti (lini perakitan, tempat tidur, konter)
- **Latar belakang**: perluasan ruang (dinding jauh, jendela, koridor, cakrawala kota)
- **Pintu masuk/keluar**: posisi dan gaya pintu, tangga, dan jalur harus eksplisit (misalnya "pintu besi di kiri frame") — ini adalah dasar untuk penataan masuk dan keluarnya karakter dalam shot berikutnya
- **Lantai dan dinding**: buat material, warna, dan kondisi spesifik (misalnya "noda oli di lantai beton", "plester kapur kusam di dinding")
- **Set dressing kunci**: tulis 2-4 bagian inti dan **posisi relatif tetapnya** (misalnya "lini perakitan berjalan di sepanjang dinding, berakhir di konter bar"); hubungan kiri-kanan/dekat-jauh antar bagian harus konsisten — jangan hanya mendaftar nama item

## Orang (Aturan Keras · Prioritas Tertinggi)

**Tidak ada orang dalam bentuk apa pun yang boleh muncul dalam gambar adegan — simpan hanya adegan itu sendiri.**

- Prompt tidak boleh mendeskripsikan orang atau menyebut apa pun yang berkaitan dengan orang
- Informasi manusia apa pun yang muncul dalam deskripsi adegan (prompt) harus diabaikan dan tidak ditulis ke dalam prompt
- Prompt harus diakhiri dengan: "Tidak ada orang dalam adegan, adegan kosong"

Semua set dressing, tekstur periode, dan elemen visual kunci dalam `prompt` (deskripsi adegan) harus dibawa serta; `lighting` (pencahayaan adegan) harus dibuat spesifik: arah sumber cahaya, suhu warna hangat/dingin, kontras kecerahan (misalnya "tabung overhead memancarkan cahaya putih dingin, melemparkan bayangan keras di bawah mesin").

## Sudut Pandang & Suasana

- Shot sudut lebar yang stabil setinggi mata atau sedikit sudut tinggi; tanpa sudut tinggi/rendah ekstrem, fisheye, atau komposisi miring (akan digunakan berulang kali sebagai adegan tetap)
- Tentukan periode waktu dan skema pencahayaan keseluruhan dari `lokasi` + `waktu` (siang / malam / senja adalah skema pencahayaan yang sangat berbeda)
- Buat kata-kata suasana konkret: "menekan" → "udara pengap, cahaya redup dan rendah"; jangan hanya menulis kata emosi abstrak
- Jangan mencampur kata-kata yang tidak relevan ke dalam output

## Larangan

- Orang apa pun — **tidak ada orang dalam bentuk apa pun yang boleh muncul dalam gambar adegan; simpan hanya adegan itu sendiri**
- Teks, teks yang dapat dibaca pada papan nama, tanda air, tanda tangan
- Motion blur, objek dalam gerakan (gambar referensi adegan harus statis dan stabil)
- Hanya mendaftar set dressing tanpa memberikan posisi relatif (struktur ruang harus kontinu dan konsisten)

## Menyimpan

Panggil `save_scene_final_prompt`: parameter prompt tidak mengandung kata-kata gaya — **gaya visual proyek secara otomatis disuntikkan oleh tool di bagian paling depan prompt akhir**.
