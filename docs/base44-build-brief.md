# Overpass 2099: Switch Run — prompt build pertama

Buat **app Base44 baru dari nol** berupa game browser satu halaman berjudul **Overpass 2099: Switch Run**. Buat kode, visual, dan mekaniknya langsung di app ini. Jangan impor repo, salin kode atau aset game lama, atau embed game eksternal.

## Prioritas: satu ronde yang bisa dimainkan

- Tampilkan tombol **Play** dan petunjuk satu kalimat: ikuti papan lajur sebelum melewati gerbang.
- Gambarkan jalan layang tiga lajur di kota neon dengan perspektif Canvas 2D. Gunakan bentuk sederhana yang digambar oleh kode untuk mobil, papan petunjuk, dan gerbang; tidak perlu aset atau pustaka eksternal.
- Mobil melaju otomatis. Pemain berpindah satu lajur dengan panah kiri/kanan atau tombol sentuh yang cukup besar. Lajur tidak bisa keluar dari batas jalan.
- Setiap gerbang menampilkan satu lajur tujuan jauh sebelum dicapai. Menyeberangi gerbang di lajur yang benar menambah skor dan kombo. Lajur yang salah mengurangi satu dari tiga peluang dan mereset kombo. Hitung tiap gerbang tepat sekali.
- Mulai timer 60 detik setelah **Play**. Akhiri ronde saat waktu habis atau peluang habis. Tampilkan skor akhir, rekor lokal browser, dan **Retry** yang mereset ronde tanpa memuat ulang halaman.
- Tampilkan sisa waktu, skor, kombo, dan peluang selama bermain. Pada layar HP, pastikan tombol sentuh tidak menutupi petunjuk lajur.

## Batasan dan pengecekan

Buat game yang bisa dibuka tanpa login. Tidak perlu backend, pembayaran, tracker, konektor GitHub, atau panggilan API eksternal. Fokus pada mekanik dan preview yang berfungsi; jangan publish otomatis.

Di **Preview**, cek alur Play → perpindahan lajur → gerbang benar dan salah → game over → Retry. Coba juga ukuran layar ponsel. Setelah build, sebutkan file yang dibuat atau diubah dan cek yang benar-benar berhasil, supaya sumbernya bisa ditinjau sebelum disalin ke repo.
