# Overpass 2099

Game balap arcade 3D di sirkuit jalanan Neo Vantis. Pilih mobil, ambil tikungan dengan rem tangan, dan gunakan nitro untuk menyalip lawan sambil menghindari lalu lintas kota.

- Balapan melawan pembalap AI dengan checkpoint, hitungan lap, dan posisi balapan.
- Sirkuit kota dengan jalan layang, jembatan, dan terowongan.
- Cuaca yang bisa diganti, efek nitro, dan HUD balapan.

## Jalankan game

Perlu browser dengan WebGL 2, [Bun](https://bun.sh/), dan Node.js yang kompatibel dengan Vite 8 (20.19+ pada seri 20, atau 22.12+).

```sh
bun install --frozen-lockfile
bun run dev
```

Buka [localhost:3000](http://localhost:3000), pilih mobil, lalu tekan **Start Street Race**. Game tidak perlu akun atau API key. Untuk membuat build produksi, jalankan `bun run build`; hasilnya ada di `dist/`.

## Kontrol

| Tombol | Aksi |
| --- | --- |
| `W` / `↑` | Gas |
| `S` / `↓` | Rem atau mundur |
| `A` / `←`, `D` / `→` | Belok kiri dan kanan |
| `Shift` | Nitro |
| `Space` | Rem tangan |
| `C` | Ganti cuaca |
| `R` | Reset posisi mobil |
| `P` / `Esc` | Jeda atau lanjut |

Di layar sentuh, gunakan tombol kemudi, gas, rem, dan nitro yang tersedia saat balapan.

## Teknologi dan kredit

Dibuat dengan React, TypeScript, Three.js, dan Vite. Versi **Overpass 2099** dikembangkan dari [Last Gear: City Rush](https://github.com/onad1ocrypto/Last-Gear-City-Rush), dengan penyesuaian judul dan papan LCD **VANTIS GP**.
