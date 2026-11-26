---
name: video-prompt
description: Spesifikasi prompt video — menghasilkan prompt pembuatan video tersegmentasi waktu dari konten segmen storyboard, dengan pemotongan yang diperbolehkan dalam satu segmen
---

# Prompt Video (segmen storyboard → video_prompt)

Dari deskripsi segmen storyboard tunggal (yang berisi struktur sub-shot 【ShotN】 dan dialog/narasi) / atmosphere / durasi, hasilkan `video_prompt` yang menggerakkan pembuatan video AI. **Satu segmen storyboard = satu video 8-15 detik, dengan pemotongan yang diperbolehkan di dalamnya**: segmen berurutan boleh berupa shot berbeda (ganti ukuran shot/sudut/subjek), disambung dengan hard cut; tetapi keseluruhan segmen **tidak pernah melintasi adegan** dan tidak pernah menggunakan kilas balik.

## Format

**Baris pertama `video_prompt` adalah header**: pertama perkenalkan karakter dan adegan mana yang muncul dalam video ini, kemudian ikuti dengan segmen waktu. Karakter dan adegan selalu direferensikan dengan @ (selama pembuatan mereka diganti dengan penanda gambar referensi yang sesuai, sehingga model video pertama-tama mengunci "siapa" dan "di mana").

```
Karakter: @Xiaoming, @Xiaohong; Adegan: @Kedai Kopi.
0-3d: @Kedai Kopi, close shot, kamera statis; @Xiaoming menunduk menatap ponselnya, jari-jari berulang kali mengetuk meja, ekspresi cemas.
3-6d: Potong ke wide shot pintu masuk; bel pintu berbunyi saat @Xiaohong mendorong pintu masuk dan berjalan masuk, membawa angin dingin.
6-9d: Potong kembali ke medium shot; @Xiaohong berjalan mendekat dengan senyuman dan duduk di seberang Xiaoming; Xiaoming berkata: "Akhirnya kamu datang juga."
```

Aturan header:
- Hanya daftarkan karakter yang benar-benar muncul dalam segmen storyboard ini dan adegan yang terikat — jangan daftarkan yang tidak muncul
- Ketika properti memiliki kemunculan notable, dapat ditambahkan ke header (misalnya `; Properti: @Surat`)
- Header adalah barisnya sendiri, diakhiri dengan titik, diikuti oleh segmen waktu

Dibagi menjadi segmen 3 detik, setiap segmen pada barisnya sendiri dipisahkan oleh baris baru, dengan rentang waktu kontinu dan berdekatan (tanpa tumpang tindih, tanpa celah).

## Pemetaan ke Deskripsi Storyboard

`description` adalah satu-satunya sumber konten video_prompt (visual, tindakan, dialog, dan narasi semuanya ada di dalamnya). Aturan konversi:

- Setiap `【ShotN】` dalam `description` dipetakan ke **1-2 segmen 3 detik berurutan** — urutan sama, tidak ada yang dihilangkan, tidak ada penggabungan, tidak ada sub-shot baru
- Dialog/narasi diekstrak dari entri "NamaKarakter berkata: "..."" / "Narasi: ..." di dalam `【ShotN】` yang sesuai dan ditugaskan ke segmen yang dipetakan untuk sub-shot tersebut; **jangan menciptakan dialog baru di luar deskripsi**
- Tindakan visual mengikuti `description`; `atmosphere` hanya digunakan untuk melengkapi deskripsi pencahayaan, nada warna, dan suasana setiap segmen

## Struktur Dalam-Segmen

Atur konten setiap segmen dalam urutan ini (item tanpa konten boleh dihilangkan, tetapi tindakan/visual wajib ada):

**Rentang waktu + adegan @referensi + ukuran shot/gerakan kamera + karakter @referensi + tindakan utama·ekspresi + dialog/narasi + suasana dan pencahayaan**

- **Segmen pertama harus menetapkan ruang**: adegan + posisi kamera + posisi dan kondisi setiap karakter, sehingga penonton langsung tahu di mana kita berada dan siapa yang harus diperhatikan
- **Pemotongan**: mulai segmen pasca-potong dengan kata transisi seperti "potong ke / potong kembali", dan nyatakan ulang ukuran shot dan subjek; titik potong harus selaras dengan struktur `【ShotN】` dalam `description` storyboard
- **Ukuran shot/gerakan kamera**: satu kondisi kamera per segmen (close shot / medium shot / wide shot / close-up; statis / push / pull / pan / tracking); gerakan kamera kontinu dalam satu sub-shot dan boleh berubah setelah pemotongan
- **Tindakan**: satu tindakan utama per segmen, dengan kata kerja konkret yang dapat dilihat (berjalan, berbalik, mendongak, mengepal, berhenti)
- **Semua emosi harus menjadi deskripsi yang terlihat**: tanpa kata-kata abstrak seperti "dia sangat sedih / suasana tegang" — tulis sebagai "dia menundukkan kepala, jari-jari mengepal pinggiran cangkir, napas semakin berat"
- **Dialog/narasi**: tulis "NamaKarakter berkata: "dialog""; narasi sebagai "Narasi: konten"; dialog panjang yang tidak bisa diucapkan dalam 3 detik dibagi ke beberapa segmen; segmen tanpa dialog boleh mencatat suara ambient/tindakan (misalnya "mesin terus menderu")

## Aturan Referensi

- `@NamaAdegan` — referensi adegan; nama harus persis cocok dengan lokasi dalam daftar adegan
- `@NamaKarakter` — referensi karakter; nama harus persis cocok dengan nama dalam daftar karakter
- `@NamaProperti` — referensi properti; nama harus persis cocok dengan nama dalam daftar properti; referensikan properti saat terlihat jelas dalam frame, digunakan, atau ditampilkan dalam close-up
- Selama pembuatan, setiap `@nama` secara otomatis diganti dengan penanda gambar referensi yang sesuai (misalnya `@Xiaoming` → `@Gambar1Xiaoming`), sehingga nama harus cocok persis — jangan disingkat atau ditambahkan simbol ekstra
- **Setiap segmen harus memiliki setidaknya satu referensi @ yang menjangkarkan frame**; segmen mana pun di mana karakter muncul harus @ karakter tersebut; hanya referensikan adegan/karakter/properti yang sudah terikat ke segmen storyboard ini

## Aturan Linimasa

- Jumlah segmen = durasi segmen storyboard ÷ 3 detik (dibulatkan ke atas); rentang waktu segmen harus berjumlah tepat sama dengan total durasi segmen
- Pacing konten: segmen pertama menetapkan → segmen tengah memajukan tindakan/konflik → segmen terakhir mendarat pada hasil atau beat emosional

## Larangan

- Pergantian lintas adegan, kilas balik (satu segmen berlangsung di satu adegan saja)
- Mereferensikan nama adegan/karakter di luar daftar
- Deskripsi psikologis abstrak, metafora sastra (model hanya mengenali citra yang dapat dilihat)
- Bahasa yang tidak cocok dengan direktif bahasa sesi

## Menyimpan

Panggil `update_storyboard` untuk hanya memperbarui bidang `video_prompt` dari segmen storyboard ini; jangan memodifikasi bidang lain apa pun, dan jangan mem-breakdown ulang seluruh episode.
