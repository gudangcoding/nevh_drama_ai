---
name: extractor
description: Aturan dan metode untuk mengekstrak karakter, adegan, dan properti
---

# Panduan Ekstraksi Karakter, Adegan & Properti

## Aturan Ekstraksi Karakter

Bidang karakter yang diekstrak (sesuai satu per satu dengan parameter tool `save_dedup_characters`):
- **name** (wajib): nama lengkap karakter
- **role**: posisi karakter — protagonis / pendukung / figuran
- **appearance**: deskripsi penampilan (300-500 karakter) — jenis kelamin, kesan usia, fitur wajah, postur, pembawaan. **Jangan keluarkan sifat kepribadian karakter secara terpisah; ubah menjadi pembawaan dan ekspresi luar yang dijalin ke dalam deskripsi penampilan** (misalnya "kepribadian dingin" harus ditulis sebagai "tatapan dingin, ekspresi terkendali, jarang tersenyum")
- **styling**: gaya — potongan rambut, pakaian, riasan, aksesori, dll.
- **description**: latar belakang dan hubungan karakter (suplemen opsional)

## Aturan Ekstraksi Adegan

Bidang adegan yang diekstrak (sesuai satu per satu dengan parameter tool `save_dedup_scenes`):
- **location** (wajib): nama tempat yang spesifik
- **time**: periode waktu (misalnya siang hari / senja / larut malam); lokasi yang sama pada periode waktu berbeda dihitung sebagai adegan baru
- **prompt**: deskripsi adegan — ruang, set dressing, tekstur periode, elemen visual kunci (latar belakang murni, tanpa orang)
- **lighting**: pencahayaan adegan — sumber cahaya, nada warna, kontras kecerahan, suasana

## Aturan Ekstraksi Properti

**Prinsip inti: lebih baik kurang dari pada berlebih.** Properti adalah aset berbiaya tinggi yang digunakan untuk membuat foto produk berlatar belakang putih dan direferensikan oleh close-up video; hanya properti yang kritis bagi plot yang layak diekstrak. Satu episode biasanya memiliki **0-3** properti kunci; jika lebih dari 3, urutkan berdasarkan kepentingan plot dan simpan hanya 3 teratas.

Kedua kondisi berikut harus terpenuhi — tidak ada yang opsional:
1. **Langsung menggerakkan plot**: kemunculan, serah terima, kerusakan, atau penemuan item tersebut memicu perubahan plot (misalnya senjata pembunuh, token, dokumen kunci, hadiah cinta, bukti kunci).
2. **Layak dibuatkan gambar tersendiri**: storyboard selanjutnya akan memberinya close-up atau muncul berulang, sehingga memerlukan penampilan yang tetap.

**Tiga pertanyaan mandiri** (tanya dan jawab sendiri untuk setiap kandidat properti; jika salah satu jawaban "tidak", gugurkan):
- (1) Apakah plot tetap berlanjut jika dihapus? → Jika ya, **jangan ekstrak** (itu hanya properti dekoratif)
- (2) Apakah ini hanya benda sehari-hari yang digunakan karakter secara santai (ponsel, sumpit, gelas air, rokok, payung)? → Jika ya, **jangan ekstrak**
- (3) Apakah ini bagian dari set dressing (meja dan kursi, lampu, pintu dan jendela, hiasan dinding, peralatan makan)? → Jika ya, **jangan ekstrak** (ini termasuk dalam deskripsi adegan)

**Properti non-khas**: benda biasa yang digunakan secara santai tanpa mempengaruhi arah plot; set dressing dan furnitur; benda yang hanya disebutkan sekali dan tidak muncul lagi; pakaian reguler karakter (termasuk dalam styling karakter).

Jika tidak ada properti yang memenuhi syarat, **jangan memaksa ekstraksi** — cukup kirimkan array kosong saat memanggil `save_dedup_props`.

Bidang properti yang diekstrak (sesuai satu per satu dengan parameter tool `save_dedup_props`):
- **name** (wajib): nama properti
- **type**: kategori — sehari-hari / senjata / transportasi / dekorasi / dokumen, dll.
- **description**: hanya penampilan fisik item (material, warna, bentuk, ukuran, tingkat keausan, tanda kerusakan, dll.); jangan jelaskan tujuan plot atau hubungannya dengan karakter atau hal lain

Properti **tidak memerlukan prompt gambar** — prompt akhir properti dibuat oleh Agen pembuatan prompt sebelum pembuatan gambar (spesifikasi foto produk berlatar belakang putih).

## Langkah-langkah

1. Panggil `read_script_for_extraction` untuk membaca skrip episode saat ini
2. Panggil `read_existing_characters` untuk melihat karakter proyek yang sudah ada dan karakter yang sudah terhubung ke episode saat ini
3. Panggil `read_existing_scenes` untuk melihat adegan proyek yang sudah ada dan adegan yang sudah terhubung ke episode saat ini
4. Panggil `read_existing_props` untuk melihat properti proyek yang sudah ada dan properti yang sudah terhubung ke episode saat ini
5. Hanya ekstrak karakter, adegan, dan properti yang benar-benar terlibat dalam episode saat ini
6. Panggil `save_dedup_characters` untuk menyimpan karakter dan menghubungkannya secara otomatis ke episode saat ini
7. Panggil `save_dedup_scenes` untuk menyimpan adegan dan menghubungkannya secara otomatis ke episode saat ini
8. Panggil `save_dedup_props` untuk menyimpan properti dan menghubungkannya secara otomatis ke episode saat ini

## Aturan Episode Saat Ini

- Tujuannya adalah mengisi karakter, adegan, dan properti yang dibutuhkan oleh "episode saat ini", bukan memindai ulang seluruh proyek
- Jika aset sudah ada di proyek tetapi belum terhubung ke episode saat ini, gunakan kembali dan hubungkan ke episode saat ini
- Aturan deduplikasi: karakter/properti dicocokkan secara tepat berdasarkan nama, adegan dicocokkan secara tepat berdasarkan [lokasi + periode waktu]; jika ada kecocokan, utamakan penggunaan ulang — jangan membuat duplikat
- Deduplikasi nama mirip: ketika nama memiliki kualifikasi atau alias dalam tanda kurung, bandingkan berdasarkan bagian utama sebelum tanda kurung (misalnya "Lin Xiaoyu (protagonis)" dan "Lin Xiaoyu" adalah karakter/properti yang sama — gunakan kembali yang sudah ada); normalized_name yang dikembalikan oleh read_existing_characters / read_existing_props adalah nama yang ternormalisasi, dan normalized_location berlaku sama untuk adegan — gunakan ini untuk penilaian
