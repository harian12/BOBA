# Plan: Advanced Log Tailer & Watcher

## 1. Goal
Membuat fitur "Log Watcher" yang mendedikasikan satu UI panel untuk membaca, men-streaming, dan memantau file log server (misal: Nginx, Apache, syslog, PM2, atau file `.log` spesifik) tanpa perlu mengetik `tail -f` di terminal secara manual.

## 2. Fitur Utama (Requirements)
- **Live Streaming:** Menampilkan baris log baru secara realtime di UI dengan auto-scroll ke bawah.
- **Smart Highlighting:** Otomatis mewarnai teks yang mengandung kata kunci (misal: `ERROR` jadi merah, `WARN` kuning, `INFO` biru).
- **Log Source Selector:** Menyediakan beberapa preset log (misal `/var/log/syslog`, `/var/log/nginx/error.log`) dan input path custom.
- **AI Diagnostics:** Integrasi dengan AI Copilot. Jika ada error, user bisa menyorot teks log dan klik "Diagnosa Error Ini" agar AI mencarikan solusi (seperti izin folder, package kurang, dll).

## 3. Pendekatan Teknis (Approach)
- Menggunakan session SSH channel khusus dari Rust (`ssh_session.rs`) yang menjalankan `tail -f <path>` di background.
- Mengalirkan (streaming) output dari channel tersebut ke frontend Vue via Tauri Events.
- Jika tab ditutup, channel/proses `tail -f` di server harus di-*kill* untuk menghindari resource leak.

## 4. UI / UX
- Bisa berbentuk Sub-tab di SFTP Manager (karena terkait file) atau di SSH Terminal.
- Tampilan teks mirip code editor/terminal (Monospace) dengan tombol "Pause Stream", "Clear", dan "Word Wrap".

## 5. Scope Boundaries
- **In-Scope:** Tailing file log berbasis teks, pewarnaan statis.
- **Out-of-Scope:** Parsing struktur log kompleks (seperti Elasticsearch/Kibana json indexing) — ini hanya file reader sederhana tapi cerdas.