# BOBA - Remote Terminal & Suite SFTP Windows dengan Sinkronisasi Multi-Perangkat

BOBA adalah aplikasi remote terminal & SFTP manager modern untuk Windows dengan sinkronisasi multi-perangkat berbasis **End-to-End Encryption (E2EE Zero-Knowledge)**. Dibangun menggunakan arsitektur desktop Tauri v2 (Rust) dan antarmuka Nuxt 4 / Vue 3.

---

## Daftar Fitur Utama

### 1. BOBA AI Server Copilot & Autonomous Agent (v0.1.4)
- **Multi-Provider AI Terbuka:**
  - Integrasi dengan provider cloud: **OpenAI** (GPT-4o), **Anthropic Claude** (Claude 3.7 / 3.5 Sonnet), **Google Gemini** (Gemini 2.5 Flash), serta **Custom OpenAI-Compatible** (DeepSeek, OpenRouter, Groq, vLLM).
  - Dukungan AI Lokal / Self-Hosted: **Ollama** (`qwen2.5-coder`, `deepseek-r1`, `llama3`).
- **Auto-Fetch Model Dinamis:**
  - Tombol `🔄 Tarik Model` di pengaturan provider otomatis menarik dan menampilkan semua model yang tersedia langsung dari `baseUrl` endpoint.
- **Server Tool-Calling & Security Engine:**
  - `exec_command`: Menjalankan perintah bash di server remote secara aman melalui channel SSH.
  - `read_file`: Membaca konten teks file konfigurasi atau file log server.
  - `write_file`: Menulis / mengubah file konfigurasi dengan preview diff konten & otomatis membuat backup cadangan `<path>.boba.bak`.
  - `list_dir`: Memindai dan menampilkan daftar direktori remote secara terstruktur via SFTP.
  - `inspect_service`: Diagnosa status systemd service & cuplikan journalctl logs secara langsung.
  - `run_security_audit`: Menjalankan audit menyeluruh (konfigurasi SSH, port terbuka, status firewall UFW, cron job persistensi, SUID binaries, dan hak sudoers).
  - `check_auth_failures`: Memindai log otentikasi untuk mendeteksi IP penyerang yang melakukan brute-force SSH.
  - `setup_security_hardening`: Menerapkan baseline keamanan server dengan proteksi anti-lockout SSH, aktivasi firewall UFW, dan fail2ban.
- **Dual Execution & Copilot Mode:**
  - `📋 Mode Plan`: Analisis dan diagnosa read-only (perintah berisiko tinggi dan modifikasi file diblokir).
  - `🔨 Mode Build`: Eksekusi perbaikan, hardening, dan perubahan konfigurasi server.
  - `🛡️ Mode Konfirmasi (Confirm)`: AI meminta persetujuan manual pengguna (`[✓ Jalankan]` / `[✕ Tolak]`) untuk setiap perintah.
  - `⚡ Mode Otomatis (Auto)`: Menjalankan tindakan perbaikan secara otonom (autonomous multi-step loop) dengan SSH lockout safeguard.
- **Runbook Generator (Markdown & Shell Script):**
  - Tombol `📄` pada drawer untuk mengunduh SOP Runbook Markdown (`.md`) dan rangkaian skrip bash yang telah dieksekusi.
- **Background SSH Auto-Connect:**
  - AI dapat mengakses server manapun dari Vault secara otomatis di latar belakang tanpa harus membuka tab terminal terlebih dahulu.
- **Integrasi Konteks & Pintasan:**
  - **Terminal:** Tombol toolbar `✨ Copilot` dan klik kanan context menu: `✨ Ask Copilot (Selection)` / `Diagnose with Copilot`.
  - **SFTP:** Klik kanan file konfigurasi/log: `✨ Analisis dengan AI Copilot`.
  - **Pintasan Global:** Tekan `Ctrl+Shift+A` untuk membuka/menutup drawer samping AI Copilot.

### 2. Terminal SSH Multi-Tab
- **Manajemen Tab**: Buka banyak koneksi SSH secara simultan dalam tab terpisah.
- **Rendering Performa Tinggi**: Menggunakan `@xterm/xterm` dengan akselerasi WebGL dan dynamic canvas sizing (`@xterm/addon-fit`).
- **PTY Rust Backend**: Emulasi terminal penuh via `russh` dengan penanganan resize dinamis dan reconnect otomatis.
- **Clipboard & Pintasan Native**: Mendukung shortcut keyboard `Ctrl+Shift+T` (tab baru), `Ctrl+W` (tutup tab), `Ctrl+Tab` (pindah tab), serta sinkronisasi clipboard native `Ctrl+V` dan copy-on-select.
- **Snippet Runner**: Panel command cepat untuk mengeksekusi snippet script/perintah (misal: cek CPU, disk usage, log tail) langsung ke terminal aktif dengan satu klik.

### 3. Manajer SFTP Dua Panel & Drawer SFTP Khusus
- **Transfer Dua Panel Antar-Sesi**:
  - Transfer dua arah antara **Mesin Lokal ↔ Remote Server**.
  - Transfer langsung antara **Remote Server A ↔ Remote Server B** (Inter-session transfer via buffer memori).
- **Papan Klip Berkas Lengkap (Copy, Cut, Paste)**:
  - Shortcut `Ctrl+C`, `Ctrl+X`, `Ctrl+V`, `Escape`, serta menu konteks dan floating banner.
  - Tampilan visual redup (*opacity-40 italic*) untuk file dalam status dipotong (*Cut*).
  - Pengecekan konflik nama file saat Paste dengan konfirmasi **Timpa (Overwrite)** atau **Lewati (Skip)**.
- **Drag & Drop ke Baris Folder**:
  - Pindahkan file/folder seketika dengan menarik dan melepaskannya langsung ke baris folder tujuan (*Move into folder*).
- **Navigasi Keyboard & Riwayat Folder**:
  - `Enter`: Buka folder yang dipilih atau buka file di editor internal.
  - `Backspace`: Navigasi naik ke folder induk (*Up*).
  - `ArrowUp` / `ArrowDown`: Pindahkan seleksi file aktif di panel yang berfokus.
  - Tombol `◀ Back` dan `▶ Forward` di toolbar serta shortcut `Alt+Left` / `Alt+Right`.
- **Filter Dotfiles & Hitung Ukuran Folder**:
  - Tombol `👁️` di toolbar dan shortcut `Ctrl+H` untuk sembunyikan/tampilkan file berawalan titik (`.env`, `.git`, `.cache`).
  - Klik kanan folder atau klik kolom `<DIR>` untuk menghitung total ukuran folder (`du -sb` via SSH untuk remote, pemindaian rekursif cepat untuk lokal).
- **Dukungan Symlink Direktori**:
  - Direktori symlink di Linux otomatis dikenali sebagai folder dan dapat dinavigasi via klik ganda.
- **Agregat Kecepatan & Auto-Refresh**:
  - Header drawer transfer menampilkan total akumulasi kecepatan (`⚡ X MB/s`) dan perkiraan sisa waktu seluruh antrean (`· ETA`).
  - Auto-refresh otomatis memperbarui daftar file di folder tujuan begitu transfer background selesai.
- **Navigasi Cepat & Markah (Bookmarks)**:
  - Auto-deteksi drive lokal Windows (`C:`, `D:`, `E:`).
  - Shortcut path server cepat (`/var/www`, `/etc`, `/home`, `/root`, `/tmp`, `/var/log`).
  - Fitur **Bookmark Folder (⭐)** untuk menyimpan direktori remote favorit.
- **Editor Teks Terintegrasi**:
  - Edit file remote atau lokal langsung di tab editor tanpa software pihak ketiga.
  - Shortcut penyimpanan `Ctrl+S` dengan sinkronisasi otomatis ke remote SFTP.
- **Operasi Berkas Lengkap**:
  - Upload dan download batch / folder rekursif.
  - Drag and drop transfer file/folder antar panel dan dari Windows File Explorer.
  - Manajemen izin akses (dialog Chmod dengan mode oktal dan simbolik `rwx`).
  - Ekstraksi arsip remote (`.tar.gz`, `.tar.bz2`, `.zip`, `.tar`) dan pembuatan arsip langsung di server.
  - Ubah nama (Rename), buat file/folder baru, dan hapus batch dengan modal konfirmasi.
- **Drawer SFTP Samping**: Drawer SFTP terintegrasi di samping terminal SSH aktif untuk transfer file cepat tanpa membuka tab SFTP terpisah.

### 4. Hierarki Sesi & Folder (Tampilan Pohon)
- **Pengorganisasian Folder**: Kelompokkan sesi SSH ke dalam folder tanpa batas.
- **Drag & Drop Andal**: Pengorganisasian sesi dan pengurutan ulang folder menggunakan pointer-based drag-and-drop yang stabil di Windows WebView2.
- **Folder Tertutup Secara Default**: Folder dalam kondisi tertutup saat aplikasi pertama kali dibuka untuk menjaga privasi daftar server.
- **Menu Konteks Klik Kanan**:
  - Buka terminal SSH atau SFTP Manager langsung dari sesi.
  - Cut / Paste sesi antar folder.
  - Rename dan Delete folder/sesi dengan mudah.
- **Pencarian & Filter Waktu Nyata**: Pencarian cepat sesi berdasarkan nama atau alamat host.

### 5. Vault Kunci SSH & Keamanan Kredensial
- **Dukungan Kredensial Fleksibel**: Otentikasi sesi via Password atau SSH Private Key.
- **Impor Kunci Beragam Format**: Mendukung format OpenSSH, PEM, RSA, Ed25519, dan ECDSA baik via file picker maupun paste manual teks kunci.
- **Proteksi Master Password**: Akses melihat private key di vault dilindungi verifikasi master password.

### 6. Sinkronisasi E2EE Zero-Knowledge & Keamanan
- **Derivasi Kunci Argon2id**: Master Password di-hash secara lokal di perangkat menggunakan Argon2id dan salt unik per pengguna.
- **Enkripsi AES-256-GCM / ChaCha20-Poly1305**: Seluruh data vault (sesi, host, username, kredensial, SSH keys, snippets) dienkripsi sebelum disimpan di disk lokal atau dikirim ke cloud.
- **Sinkronisasi Cloud Zero-Knowledge**: Server sinkronisasi tidak memiliki akses ke master password maupun kunci enkripsi. Server hanya menyimpan ciphertext terenkripsi.
- **Resolusi Konflik Multi-Perangkat**: Sinkronisasi otomatis berbasis timestamp versi vault saat aplikasi dibuka atau tersambung ke jaringan.
- **Kunci / Buka Kunci Vault**: Fitur kunci manual dan prompt unlock saat aplikasi dibuka kembali.
- **Ubah Master Password**: Ubah master password dengan re-enkripsi penuh seluruh payload vault secara lokal.

---

## Arsitektur & Teknologi

| Komponen | Teknologi |
| --- | --- |
| **Desktop Shell** | Tauri v2 (Rust) |
| **SSH & SFTP Engine** | `russh` & `russh-sftp` (Pure Async Rust) |
| **Crypto Core** | `argon2`, `aes-gcm`, `chacha20poly1305` |
| **Frontend Framework** | Nuxt 4 (SPA Mode), Vue 3, TypeScript |
| **State Management** | Pinia (`@pinia/nuxt`) |
| **UI & Styling** | Tailwind CSS, Lucide Icons |
| **Terminal Core** | `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl` |
| **Backend Sync Server** | Hono, SQLite / LibSQL (`@libsql/client`), Drizzle ORM |

---

## Panduan Menjalankan

### Persyaratan Sistem
- Node.js 18+ & npm
- Rust & Cargo (MSRV 1.77+)
- Windows Build Tools (C++ runtime & WiX Toolset v3 untuk build installer MSI)

### 1. Menjalankan Server Sinkronisasi (Opsional)
```bash
npm run dev:server
# Berjalan di http://localhost:8787
```

### 2. Menjalankan Klien Desktop (Mode Pengembangan)
```bash
npm run dev:desktop
```

### 3. Membangun (Build) Installer Produksi Windows
```bash
npm run build:desktop
```
Output file installer `.exe` (NSIS) dan `.msi` (WiX) akan tersedia di:
`apps/desktop/src-tauri/target/release/bundle/`
