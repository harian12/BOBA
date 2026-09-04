---
title: "Plan: Dedicated SFTP Manager & Dual-Session Remote Transfer"
artifact_contract: "ce-unified-plan/v1"
artifact_readiness: "implementation-ready"
execution: "code"
created_at: "2026-09-05"
---

# Plan: Dedicated SFTP Manager & Dual-Session Remote Transfer

## 1. Overview & Objectives
Sediakan antarmuka dan arsitektur transfer SFTP yang fleksibel dan intuitif:
- Menu dedicated "SFTP Transfer" di sidebar utama desktop app.
- Pilihan target dan sumber mandiri pada setiap pane: Pengguna dapat memilih apakah Pane Kiri adalah Local Machine atau Remote Session A, dan Pane Kanan adalah Remote Session B atau Local Machine.
- Backend Rust mendukung transfer stream memory-piped (Server-to-Server) tanpa perlu menulis ke disk lokal saat transfer antar remote session.

## 2. Settled Decisions
1. **Dedicated Menu di Sidebar**:
   - Menambahkan tombol menu "SFTP Manager" di `Sidebar.vue` yang langsung membuka workspace dual-transfer tab.
2. **Dual-Selectable Panes**:
   - Header tiap pane memiliki selector drop-down untuk memilih mode: `Local Machine` atau `Remote: <Session Name>`.
   - UI sangat jelas menampilkan label status koneksi dan path masing-masing sisi.
3. **Piped Transfer Server-to-Server di Rust**:
   - Command `sftp_transfer_remote_to_remote`: Stream reader dari SFTP Sesi 1 langsung dialirkan ke buffer lalu di-write ke SFTP Sesi 2.
   - Tetap mengemisikan event `sftp-progress` ke queue transfer bottom tray sehingga progres, kecepatan, dan status transfer terpantau.

## 3. Implementation Steps

### Step A: Backend Rust (`ssh_session.rs`, `commands.rs`, `lib.rs`)
1. Buat method `transfer_file_remote_to_remote`:
   - Ambil SFTP client dari `src_session_id` dan `dst_session_id`.
   - Buka `src_remote_file` untuk dibaca dan create `dst_remote_file` untuk ditulis.
   - Loop baca chunk buffer 64 KB -> write ke `dst_remote_file` dengan emit event `sftp-progress`.
   - Dukung cancel flag: Jika dibatalkan user, remove partial file di target remote.
2. Tambahkan handler command Tauri `sftp_transfer_remote_to_remote` di `commands.rs` dan daftarkan di `lib.rs`.

### Step B: Frontend Bridge & Store (`tauriBridge.ts`, `transferQueueStore.ts`)
1. Tambahkan `sftpTransferRemoteToRemote` di `tauriBridge.ts`.
2. Update `transferQueueStore.ts` untuk mendukung transfer tipe `'remote-to-remote'`.

### Step C: UI & Komponen (`Sidebar.vue`, `SftpManagerTab.vue`, `sessionStore.ts`)
1. Di `Sidebar.vue`, tambahkan tombol menu "SFTP Manager" untuk membuka tab dedicated SFTP tanpa harus masuk via terminal.
2. Di `SftpManagerTab.vue`:
   - Ganti pane kiri dan kanan menjadi dinamis:
     - Left Pane: Dropdown pilihan (`💻 Local Computer` / daftar sesi server aktif).
     - Right Pane: Dropdown pilihan (`🌐 Server Aktif` / daftar sesi server lain / `💻 Local Computer`).
   - Transfer logic mengecek:
     - Jika Local -> Remote: `uploadLocalItem`
     - Jika Remote -> Local: `downloadRemoteItem`
     - Jika Remote -> Remote: `sftpTransferRemoteToRemote`
3. Tambahkan tombol connect/quick select sesi server yang belum terhubung langsung di dalam pane.

## 4. Verification Plan
- Unit test Rust / cargo check untuk command baru.
- Frontend build via `npm run generate`.
- Verifikasi visual navigasi dan selector dua sesi.
