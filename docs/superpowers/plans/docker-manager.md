# Plan: Docker & Container Manager (Tab SSH)

## 1. Goal
Menambahkan sub-tab "Docker" pada panel Terminal/SSH untuk memberikan antarmuka grafis (GUI) dalam mengelola container, image, dan volume secara real-time langsung dari remote server.

## 2. Fitur Utama (Requirements)
- **Container List:** Menampilkan daftar container (running/exited) dengan status (hijau/merah), uptime, ports, dan nama image.
- **Actions:** Tombol Start, Stop, Restart, dan Delete (RM) per container.
- **Logs Viewer:** Mengklik container akan membuka panel log (tail log) secara live, mirip terminal tapi khusus log container (`docker logs -f`).
- **Analisis Log AI:** Tombol "Analisa Log dengan AI" untuk mengirim potongan log error terakhir ke AI Copilot untuk dicarikan solusinya.

## 3. Pendekatan Teknis (Approach)
- Menggunakan perintah CLI Docker standar yang dikirim melalui `tauriBridge.sshExecCommand` (misalnya: `docker ps --format "{{json .}}"`).
- Tidak menggunakan Docker HTTP API langsung (karena sering diblokir oleh default daemon); melainkan membungkus command SSH agar tidak memerlukan setup tambahan di server target.
- Polling ringan (setiap 5-10 detik) untuk me-refresh status list jika sub-tab "Docker" sedang terbuka.

## 4. UI / UX
- Sub-tab baru (misalnya ikon Paus/Docker) di area kanan atau bawah TerminalTab.
- Tabel data sederhana dengan layout yang ringkas.
- Panel *slide-out* atau modal log viewer saat satu container diklik.

## 5. Scope Boundaries
- **In-Scope:** Container (Start/Stop/Logs), Image (List/Hapus).
- **Out-of-Scope:** Docker Compose editing kompleks, swarm management, atau pembuatan Dockerfile (hanya fokus di runtime management).