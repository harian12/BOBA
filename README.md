# BOBA - Windows Remote Terminal & SFTP Suite with Multi-Device Sync

BOBA adalah aplikasi remote terminal & SFTP manager modern untuk Windows dengan sinkronisasi multi-device berbasis End-to-End Encryption (E2EE Zero-Knowledge).

---

## Arsitektur & Tech Stack
- **Desktop Client**: Tauri v2 + Rust (`russh`, `russh-sftp`, `argon2`, `aes-gcm`) + **Nuxt 4 / Vue 3** (`@pinia/nuxt`, `@nuxtjs/tailwindcss`, `@xterm/xterm`)
- **Backend Sync Server**: Hono (`@libsql/client` / SQLite, `drizzle-orm`, JWT Auth, E2EE Blob Storage)

---

## Cara Menjalankan

### 1. Menjalankan Sync Server (Hono)
```bash
npm run dev:server
# Server berjalan di http://localhost:8787
```

### 2. Menjalankan Desktop Client (Development)
```bash
npm run dev:desktop
```

### 3. Build Production Installer Windows
```bash
npm run build:desktop
```
Installer `.exe` / `.msi` akan di-generate di folder `apps/desktop/src-tauri/target/release/bundle/`.

---

## Fitur Utama
1. **Multi-Tab SSH Terminal**: Tab manager interaktif berbasis `@xterm/xterm` + WebGL rendering.
2. **Integrated 2-Way SFTP Explorer**: File manager remote terintegrasi (browse folder, upload/download, remote file editor).
3. **Private Key from File**: Load SSH Private Key langsung dari file disk (`.pem`, `.key`, `id_rsa`, `id_ed25519`, dll) atau paste langsung.
4. **Zero-Knowledge E2EE Sync**:
   - Master Password di-hash lokal via Argon2id.
   - Sesi, host, SSH key, dan snippets dienkripsi via AES-256-GCM sebelum dikirim ke backend Hono.
5. **Nuxt 4 SPA Architecture**: Modern frontend reactivity, state management Pinia, dan styling Tailwind CSS.
