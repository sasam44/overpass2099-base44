# Overpass 2099: Switch Run

Game balap arcade 2D di jalan layang kota neon. Baca papan petunjuk, pindah ke lajur yang benar sebelum gerbang, dan pertahankan kombo sampai waktu habis.

> **Status:** brief build pertama sudah siap. Repo ini belum memuat kode game atau tautan versi yang bisa dimainkan.

## Target prototipe

- **Ronde 60 detik:** mobil melaju otomatis di jalan tiga lajur.
- **Risiko dan skor:** tiap gerbang yang dilewati di lajur benar menambah skor dan kombo. Pilihan salah menghabiskan satu dari tiga peluang.
- **Kontrol:** panah kiri/kanan di komputer dan tombol sentuh di HP.
- **Main ulang:** lihat skor akhir, simpan rekor di browser, dan mulai ronde baru dengan **Retry**.

## Mulai di Base44

1. Buka [Base44](https://base44.com/) dan mulai app baru.
2. Tempel isi [brief build pertama](docs/base44-build-brief.md) ke prompt **Build**.
3. Di **Preview**, cek bahwa **Play**, perpindahan lajur, kombo, penalti, dan **Retry** berfungsi. Uji juga di layar HP.

## Update repo

Setelah prototipe berfungsi, tambahkan file sumber yang benar-benar dibuat atau diubah di Base44. Tulis perubahan dan hasil pengecekan di commit. Jangan unggah `.env`, token, atau `node_modules`. Tambahkan tautan game publik setelah versi yang bisa dimainkan tanpa login dipublikasikan.
