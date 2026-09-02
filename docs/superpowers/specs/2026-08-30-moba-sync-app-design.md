# Design Specification: BOBA - Windows Remote Terminal & SFTP Suite with Multi-Device Sync

- **Application Name**: **BOBA**
- **Date**: 2026-08-30
- **Status**: Approved
- **Scope**: Windows Desktop Application (MobaXterm alternative) with Cloud E2EE Session Sync

---

## 1. Overview & Objectives

Tujuan proyek adalah membangun aplikasi desktop modern untuk Windows bernama **BOBA** yang menggabungkan kapabilitas remote management (SSH Terminal + Integrated SFTP Explorer) dengan kemampuan sinkronisasi data sesi/kredensial antar perangkat secara aman menggunakan End-to-End Encryption (E2EE).

### Key Value Propositions
- **Performa & Ringan**: Menggunakan Tauri v2 + Rust untuk native speed, konsumsi memori rendah, dan binary compact dibanding Electron.
- **Modern UI**: Frontend berbasis Vue 3 + Tailwind CSS + Xterm.js untuk antarmuka tabbed terminal dan panel SFTP yang responsif.
- **Zero-Knowledge E2EE Cloud Sync**: Session, host, SSH key, dan credential dienkripsi di sisi klien sebelum dikirim ke backend Hono. Server tidak pernah memiliki akses ke plaintext data pengguna.

---

## 2. Tech Stack

### Desktop Client
- **Core Engine / Backend Shell**: Tauri v2 (Rust)
- **Frontend Framework**: Vue 3 (Composition API, `<script setup>`, Vite, TypeScript)
- **State Management**: Pinia
- **Styling & UI**: Tailwind CSS, Radix Vue / Lucide Icons
- **Terminal Emulator**: `@xterm/xterm`, `@xterm/addon-webgl`, `@xterm/addon-fit`
- **Rust Crates**:
  - `russh` / `ssh2`: SSH Client & PTY management
  - `russh-sftp` / `ssh2::Sftp`: SFTP file transfer and remote file system browsing
  - `aes-gcm` / `chacha20poly1305`: Authenticated symmetric encryption
  - `argon2`: Password-based key derivation (Argon2id)
  - `reqwest`: HTTP client untuk sync API
  - `serde`, `serde_json`: Serialisasi data

### Sync Backend Server
- **Framework**: Hono (TypeScript)
- **Runtime**: Node.js / Bun / Cloudflare Workers
- **Database & ORM**: PostgreSQL / SQLite via Drizzle ORM
- **Authentication**: JWT / Session Token + Bcrypt/Argon2 password auth

---

## 3. System Architecture

```
+-------------------------------------------------------------------------+
|                       Tauri v2 Desktop App (Client)                     |
|                                                                         |
|  [ Vue 3 UI Layer ]                                                     |
|   ├── Session Sidebar (Folder Hierarchy, Host List, Quick Connect)       |
|   ├── Tabbed Terminal Manager (Multi-tab xterm.js instance)             |
|   ├── Integrated SFTP Explorer (Dual-pane / Side drawer, drag-and-drop)|
|   ├── Master Key / Vault Unlock Modal                                   |
|   └── Sync Settings & Conflict Resolution Dialog                        |
|                                                                         |
|  [ Tauri IPC Bridge (Commands & Events) ]                               |
|                                                                         |
|  [ Rust Core Layer ]                                                    |
|   ├── SSH/PTY Manager (Session lifecycle, bidirectional I/O stream)    |
|   ├── SFTP Engine (Directory listing, upload/download streams)          |
|   ├── Crypto Vault Manager (Argon2id KDF, AES-256-GCM Encrypt/Decrypt)  |
|   └── Sync Client (HTTP sync requests, version checking, local cache)  |
+-----------------------------------┬-------------------------------------+
                                    │ HTTPS (REST API)
                                    ▼
+-------------------------------------------------------------------------+
|                            Hono Sync Server                             |
|  ├── /api/auth (Register, Login, User Salt, Refresh Token)              |
|  ├── /api/vault (GET / PUT Encrypted Blob, Version Verification)        |
|  ├── Auth Middleware (JWT Validation)                                   |
|  └── Persistence Layer (Users Table, Vault Blobs Table)                 |
+-------------------------------------------------------------------------+
```

---

## 4. End-to-End Encryption (E2EE) & Security Model

### Key Derivation & Encryption Specs
1. **Master Password**: Dimasukkan oleh user saat inisialisasi vault lokal. Master password tidak pernah dikirim ke server.
2. **Salt Generation**: Server menyediakan user UUID / random salt unik per akun saat login/registrasi.
3. **Key Derivation**:
   $$\text{MasterKey} = \text{Argon2id}(\text{password}=\text{MasterPassword}, \text{salt}=\text{UserSalt}, \text{params}=\text{Default OWASP})$$
4. **Vault Encryption**:
   - Algoritma: **AES-256-GCM** (atau XChaCha20-Poly1305).
   - Nonce: 12-byte cryptographically secure random bytes generated per encryption cycle.
   - Ciphertext Format: `nonce (12 bytes) || auth_tag (16 bytes) || encrypted_payload`.

### Vault Data Schema (Decrypted Client-side)
```json
{
  "vault_version": 1,
  "updated_at": "2026-08-30T10:00:00Z",
  "device_id": "windows-client-abc123",
  "folders": [
    {
      "id": "fld_1",
      "name": "Production",
      "parent_id": null
    }
  ],
  "sessions": [
    {
      "id": "ses_1",
      "folder_id": "fld_1",
      "name": "Prod Web 01",
      "protocol": "ssh",
      "host": "192.168.1.50",
      "port": 22,
      "username": "deploy",
      "auth_type": "key",
      "key_id": "key_1",
      "sftp_auto_open": true
    }
  ],
  "keys": [
    {
      "id": "key_1",
      "name": "id_ed25519_prod",
      "private_key": "-----BEGIN OPENSSH PRIVATE KEY-----\n..."
    }
  ],
  "snippets": [
    {
      "id": "snp_1",
      "title": "Nginx Status",
      "command": "systemctl status nginx\n"
    }
  ]
}
```

---

## 5. Hono Backend API Specification

### Database Schema (Drizzle ORM)
- **users**:
  - `id`: `text` (UUID, Primary Key)
  - `email`: `text` (Unique)
  - `password_hash`: `text` (Argon2 / Bcrypt untuk auth server)
  - `salt`: `text` (Hex-encoded salt untuk client master key derivation)
  - `created_at`: `timestamp`
- **vault_blobs**:
  - `user_id`: `text` (Foreign Key -> users.id, Primary Key)
  - `version`: `integer` (Auto-incrementing version counter)
  - `encrypted_data`: `text` (Base64-encoded encrypted payload)
  - `checksum`: `text` (SHA-256 hash dari encrypted_data)
  - `updated_at`: `timestamp`

### API Endpoints
1. `POST /api/auth/register`
   - Request: `{ "email": string, "password": string }`
   - Action: Create user, generate unique salt.
   - Response: `{ "user_id": string, "salt": string, "token": string }`
2. `POST /api/auth/login`
   - Request: `{ "email": string, "password": string }`
   - Response: `{ "user_id": string, "salt": string, "token": string }`
3. `GET /api/vault`
   - Headers: `Authorization: Bearer <JWT>`
   - Response: `{ "version": number, "encrypted_data": string, "checksum": string, "updated_at": string }`
4. `PUT /api/vault`
   - Headers: `Authorization: Bearer <JWT>`
   - Request: `{ "expected_version": number, "encrypted_data": string, "checksum": string }`
   - Response:
     - `200 OK`: `{ "version": number, "updated_at": string }`
     - `409 Conflict`: `{ "error": "VERSION_CONFLICT", "current_version": number }`

---

## 6. Sync Flow & Conflict Handling

```
Device A                           Hono Server                           Device B
   |                                    |                                    |
   |--- 1. PUT /api/vault ------------->|                                    |
   |    (expected_version: 3)           |                                    |
   |<-- 200 OK (New version: 4) --------|                                    |
   |                                    |<-- 2. GET /api/vault --------------|
   |                                    |--- Return version 4 + blob ------->|
   |                                    |                                    |
   |                                    |    [Decrypt with Master Key]       |
   |                                    |    [Apply sessions locally]        |
```

### Conflict Resolution Strategy:
- Saat `PUT /api/vault` mengembalikan `409 Conflict`:
  1. Client mendownload blob terbaru dari server (`version: current`).
  2. Client mendekripsi kedua versi (lokal & remote).
  3. Client melakukan item-level reconciliation berdasarkan entity `id` dan `updated_at`.
  4. Client menyimpan hasil merge dan meng-upload versi baru.

---

## 7. Desktop Client UI/UX & Features

1. **Session Explorer (Sidebar)**:
   - Folder tree berhirarki (Drag-and-drop organizer).
   - Quick connect bar (Host, port, user).
   - Tagging, filter pencarian cepat.
2. **Terminal Workspace**:
   - Tab manager (buka banyak sesi sekaligus).
   - Split panes (horizontal & vertical).
   - WebGL renderer untuk kecepatan rendering tinggi.
   - Context menu: Copy, Paste, Snippets, Reconnect.
3. **Integrated SFTP Explorer**:
   - Panel toggle di samping terminal atau drawer bawah.
   - Sinkronisasi direktori otomatis saat perintah terminal berpindah folder (`cwd` tracking jika didukung) atau manual browse.
   - Transfer file 2 arah (Drag-and-drop dari Windows Explorer).
   - Remote file editor bawaan untuk quick edit file teks di server.
4. **Master Password & Vault Lock**:
   - Auto-lock timer / manual lock.
   - Master key disimpan hanya di memory session saat unlock (zero plain storage).

---

## 8. Verification & Testing Plan
- **Unit Tests**:
  - Rust: Validasi Argon2id KDF, enkripsi & dekripsi AES-256-GCM roundtrip.
  - Hono: Test endpoint auth, vault storage, dan version concurrency rejection (HTTP 409).
- **Integration Tests**:
  - Test flow: Register -> Set Master Password -> Create Session -> Sync to Server -> Fetch & Decrypt on Simulated Device 2.
  - Test conflict simulation: Dua request PUT bersamaan dengan expected_version yang sama.
- **End-to-End Test**:
  - Jalankan Tauri app di Windows -> Konek SSH lokal / test container -> Verifikasi transfer SFTP -> Lock/Unlock vault.
