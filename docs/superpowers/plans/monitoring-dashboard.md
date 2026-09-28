# Plan: Real-time Server Monitoring Dashboard

## 1. Goal
Menghadirkan visualisasi metrik performa server (CPU, RAM, Disk, Network) dalam bentuk grafik (Charts) dan gauge di panel tab tersendiri agar pengguna dapat mendeteksi anomali server secara sekilas.

## 2. Fitur Utama (Requirements)
- **Top Bar / HUD:** Ringkasan metrik global (Uptime, Total RAM dipakai, rata-rata Load).
- **Grafik Realtime (Line Charts):** 
  - Grafik utilisasi CPU (%) selama 5 menit terakhir.
  - Grafik pemakaian RAM & Swap.
- **Disk & Network:** Indikator pie-chart kapasitas disk (`/` root, dll) dan grafik kecepatan upload/download (Mbps).
- **Process List Terberat:** Daftar 5 proses teratas yang memakan memori/CPU terbanyak.

## 3. Pendekatan Teknis (Approach)
- Frontend akan menggunakan library grafik Vue ringan (misal: `chart.js` atau komponen SVG custom sederhana) untuk menggambar grafik.
- Backend Rust sudah punya command `ssh_get_server_metrics`. Saat tab Dashboard terbuka, frontend akan melakukan polling per 2-3 detik ke command ini.
- Disimpan dalam buffer array pendek di frontend (misal 60 titik data untuk grafik 1 menit ke belakang).

## 4. UI / UX
- Bisa dipilih melalui tombol di "View Mode" Terminal Tab (antara *CLI View* dan *Dashboard View*).
- Desain *Dark Mode* modern layaknya dasbor admin dengan aksen warna hijau/biru BOBA.

## 5. Scope Boundaries
- **In-Scope:** Pemantauan metrik server level OS yang umum untuk distribusi Linux populer (Debian/Ubuntu/CentOS).
- **Out-of-Scope:** Setup agent monitoring terpisah (seperti Prometheus/Node Exporter). Semua data harus ditarik murni menggunakan bash script ringan lewat koneksi SSH yang sudah ada (zero setup untuk user).