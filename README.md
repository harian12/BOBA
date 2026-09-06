# BOBA - Windows Remote Terminal & SFTP Suite with Multi-Device Sync

BOBA adalah aplikasi remote terminal & SFTP manager modern untuk Windows dengan sinkronisasi multi-device berbasis **End-to-End Encryption (E2EE Zero-Knowledge)**. Dibangun menggunakan arsitektur desktop Tauri v2 (Rust) dan antarmuka Nuxt 4 / Vue 3.

---

## Daftar Fitur Utama

### 1. Multi-Tab SSH Terminal
- **Tab Management**: Buka banyak koneksi SSH secara simultan dalam tab terpisah.
- **High-Performance Rendering**: Menggunakan `@xterm/xterm` dengan WebGL acceleration dan dynamic canvas sizing (`@xterm/addon-fit`).
- **PTY Rust Backend**: Emulasi terminal penuh via `russh` dengan penanganan resize dinamis dan reconnect otomatis.
- **Native Clipboard & Shortcuts**: Mendukung shortcut keyboard `Ctrl+Shift+T` (tab baru), `Ctrl+W` (tutup tab), `Ctrl+Tab` (pindah tab), serta sinkronisasi clipboard native `Ctrl+V` dan copy-on-select.
- **Snippet Runner**: Panel command cepat untuk mengeksekusi snippet script/perintah (misal: cek CPU, disk usage, log tail) langsung ke terminal aktif dengan satu klik.

### 2. Dedicated Dual-Pane SFTP Manager & SFTP Drawer
- **Dual-Pane Inter-Session Transfer**:
  - Transfer dua arah antara **Local Machine ↔ Remote Server**.
  - Transfer langsung antara **Remote Server A ↔ Remote Server B** (Inter-session transfer via buffer lokal).
- **Quick Navigation & Bookmarks**:
  - Auto-deteksi drive lokal Windows (`C:`, `D:`, `E:`).
  - Shortcut path server cepat (`/var/www`, `/etc`, `/home`, `/root`, `/tmp`, `/var/log`).
  - Fitur **Bookmark Folder (⭐)** untuk menyimpan direktori remote favorit.
  - Navigasi breadcrumb dengan riwayat (Back/Up) dan input path manual.
- **Integrated Text Editor**:
  - Edit file remote atau lokal langsung di tab editor tanpa software pihak ketiga.
  - Shortcut penyimpanan `Ctrl+S` dengan sinkronisasi otomatis ke remote SFTP.
- **Operasi File Lengkap**:
  - Upload dan download batch / folder rekursif.
  - Drag and drop transfer file/folder antar pane dan dari Windows File Explorer.
  - Manajemen izin akses (Chmod dialog dengan mode oktal dan simbolik `rwx`).
  - Ekstraksi arsip remote (`.tar.gz`, `.tar.bz2`, `.zip`, `.tar`) dan pembuatan arsip langsung di server.
  - Rename, buat file/folder baru, dan hapus batch dengan konfirmasi modal.
- **SFTP Drawer Samping**: Drawer SFTP terintegrasi di samping terminal SSH aktif untuk transfer file cepat tanpa membuka tab SFTP terpisah.

### 3. Session & Folder Hierarchy (Tree View)
- **Folder Organization**: Kelompokkan sesi SSH ke dalam folder tanpa batas.
- **Reliable Drag & Drop**: Pengorganisasian sesi dan reordering folder menggunakan pointer-based drag-and-drop yang stabil di Windows WebView2.
- **Folder Collapsed by Default**: Folder dalam keadaan tertutup saat aplikasi pertama kali dibuka untuk menjaga privasi daftar server.
- **Right-Click Context Menu**:
  - Buka terminal SSH atau SFTP Manager langsung dari sesi.
  - Cut / Paste sesi antar folder.
  - Rename dan Delete folder/sesi dengan mudah.
- **Search & Filter Real-Time**: Pencarian cepat sesi berdasarkan nama atau alamat host.

### 4. SSH Key Vault & Credential Security
- **Dukungan Kredensial Fleksibel**: Otentikasi sesi via Password atau SSH Private Key.
- **Multi-Format Key Import**: Mendukung format OpenSSH, PEM, RSA, Ed25519, dan ECDSA baik via file picker maupun paste manual teks key.
- **Master Password Protection**: Akses melihat private key di vault dilindungi konfirmasi master password.

### 5. Zero-Knowledge E2EE Sync & Security
- **Argon2id Key Derivation**: Master Password di-hash secara lokal di perangkat menggunakan Argon2id dan salt unik per user.
- **AES-256-GCM / ChaCha20-Poly1305 Encryption**: Seluruh data vault (sesi, host, username, credential, SSH keys, snippets) dienkripsi sebelum disimpan di disk lokal atau dikirim ke cloud.
- **Zero-Knowledge Cloud Sync**: Server sync tidak memiliki akses ke master password maupun kunci enkripsi. Server hanya menyimpan ciphertext terenkripsi.
- **Multi-Device Conflict Resolution**: Sinkronisasi otomatis berbasis timestamp versi vault saat aplikasi dibuka atau tersambung ke jaringan.
- **Lock / Unlock Vault**: Fitur kunci manual dan prompt unlock saat aplikasi dibuka kembali.
- **Change Master Password**: Ubah master password dengan re-enkripsi penuh seluruh payload vault secara lokal.

---

## Arsitektur & Tech Stack

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

### 1. Menjalankan Sync Server (Opsional untuk Sync)
```bash
npm run dev:server
# Berjalan di http://localhost:8787
```

### 2. Menjalankan Desktop Client (Development)
```bash
npm run dev:desktop
```

### 3. Build Production Installer Windows
```bash
npm run build:desktop
```
Output installer `.exe` (NSIS) dan `.msi` (WiX) akan tersedia di:
`apps/desktop/src-tauri/target/release/bundle/`
