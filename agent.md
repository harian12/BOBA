# Panduan Alur Push, Build Bundle, & Auto-Updater Release BOBA

Dokumen ini berisi SOP dan alur lengkap untuk menaikkan versi, mem-build bundle desktop, menandatangani binary (*signing*), membuat Git tag, dan mempublikasikan release ke GitHub agar fitur **Cek Pembaruan (Auto-Updater)** di aplikasi dapat memverifikasi *signature minisign* dan memasang update.

---

## 1. Naikkan Versi (Version Bump)
Ubah versi di 3 file konfigurasi utama secara seragam:
1. `apps/desktop/package.json` -> `"version": "x.y.z"`
2. `apps/desktop/src-tauri/Cargo.toml` -> `version = "x.y.z"`
3. `apps/desktop/src-tauri/tauri.conf.json` -> `"version": "x.y.z"`

---

## 2. Verifikasi Kualitas Kode
Sebelum melakukan build, jalankan pemeriksaan tipe data dan pengujian:
```bash
bun run typecheck:desktop
bun run test:desktop
```

---

## 3. Kompilasi & Build Bundle Installer
Bangun binary installer produksi Windows:
```bash
bun run build:desktop
```
File installer `.exe` yang dihasilkan akan berada di:
`apps/desktop/src-tauri/target/release/bundle/nsis/BOBA_<version>_x64-setup.exe`

---

## 4. Tandatangani Binary (*Signing Minisign Signature*)
Tauri updater **wajib** memverifikasi tanda tangan digital (*minisign signature*). Konfigurasi private key dan password diambil dari file `apps/desktop/src-tauri/.env`:

```powershell
# Baca konfigurasi dari .env
$envContent = Get-Content "D:\MYP\BOBA\apps\desktop\src-tauri\.env"
$keyPath = ($envContent | Where-Object { $_ -match "^TAURI_SIGNING_PRIVATE_KEY=(.*)$" } | ForEach-Object { $matches[1].Trim() })
$password = ($envContent | Where-Object { $_ -match "^TAURI_SIGNING_PRIVATE_KEY_PASSWORD=(.*)$" } | ForEach-Object { $matches[1].Trim() })

$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -Raw $keyPath).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $password

bun run --cwd apps/desktop tauri signer sign "D:\MYP\BOBA\apps\desktop\src-tauri\target\release\bundle\nsis\BOBA_<version>_x64-setup.exe"
```
Perintah ini akan menghasilkan file signature di:
`apps/desktop/src-tauri/target/release/bundle/nsis/BOBA_<version>_x64-setup.exe.sig`

---

## 5. Commit, Push ke Main, & Buat Git Tag
Commit perubahan versi, push ke branch `main`, dan buat tag rilis:
```bash
git add apps/desktop/package.json apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/tauri.conf.json
git commit -m "chore(release): bump version to vx.y.z"
git push origin main
git tag -a vx.y.z -m "Release vx.y.z"
git push origin vx.y.z
```

---

## 6. Publikasikan GitHub Release & Auto-Updater Manifest (`latest.json`)
Auto-updater Tauri mengecek pembaruan dari URL:
`https://github.com/harian12/BOBA/releases/latest/download/latest.json`

Gunakan script PowerShell berikut untuk membuat Release dan mengunggah binary serta `latest.json` yang berisi signature valid:

```powershell
$version = "x.y.z"
$tag = "vx.y.z"
$repo = "harian12/BOBA"
$installerPath = "apps/desktop/src-tauri/target/release/bundle/nsis/BOBA_${version}_x64-setup.exe"
$sigPath = "$installerPath.sig"

# 1. Ambil token GitHub dari credential manager lokal
$gitCred = "protocol=https`nhost=github.com`n" | git credential fill
$tokenLine = ($gitCred -split "`n") | Where-Object { $_ -like "password=*" }
$token = $tokenLine.Substring(9).Trim()

$headers = @{
    "Authorization" = "token $token"
    "User-Agent" = "BOBA-Release-Script"
    "Accept" = "application/vnd.github.v3+json"
}

# 2. Buat GitHub Release
$body = @{
    tag_name = $tag
    name = "BOBA $tag"
    body = "Release $tag"
    draft = $false
    prerelease = $false
} | ConvertTo-Json

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases" -Method Post -Headers $headers -Body $body -ContentType "application/json"

# 3. Upload Binary Installer (.exe)
$uploadUrl = $release.upload_url.Replace("{?name,label}", "?name=BOBA_${version}_x64-setup.exe")
$fileBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $installerPath))
$uploadHeaders = @{
    "Authorization" = "token $token"
    "User-Agent" = "BOBA-Release-Script"
    "Content-Type" = "application/octet-stream"
}
Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $uploadHeaders -Body $fileBytes

# 4. Upload latest.json Manifest untuk Auto-Updater (dengan minisign signature)
$signature = (Get-Content -Raw (Resolve-Path $sigPath)).Trim()
$latestJson = @{
    version = $version
    notes = "Release $tag"
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = $signature
            url = "https://github.com/$repo/releases/download/$tag/BOBA_${version}_x64-setup.exe"
        }
    }
} | ConvertTo-Json -Depth 5

$uploadManifestUrl = $release.upload_url.Replace("{?name,label}", "?name=latest.json")
$jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($latestJson)
$manifestHeaders = @{
    "Authorization" = "token $token"
    "User-Agent" = "BOBA-Release-Script"
    "Content-Type" = "application/json"
}
Invoke-RestMethod -Uri $uploadManifestUrl -Method Post -Headers $manifestHeaders -Body $jsonBytes
```

### WAJIB: Kirim Body sebagai Byte UTF-8

Windows PowerShell 5.1 mengirim body `Invoke-RestMethod` yang berupa **string** memakai code page ANSI warisan, bukan UTF-8. Akibatnya setiap karakter non-ASCII rusak, dan GitHub menolak payload dengan `400 Problems parsing JSON`.

Bukan masalah pada `ConvertTo-Json`; JSON-nya sendiri valid. Gejalanya mudah salah didiagnosis karena error-nya menyebut JSON, padahal yang rusak adalah encoding-nya.

Karena itu **body apa pun yang bisa memuat teks non-ASCII harus dikirim sebagai byte**, sama seperti `latest.json` di atas:

```powershell
# SALAH: string body, karakter non-ASCII akan rusak
Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $json -ContentType "application/json"

# BENAR: byte UTF-8 eksplisit
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $bytes -ContentType "application/json; charset=utf-8"
```

Berlaku untuk:
- `body` saat membuat GitHub Release (`POST /releases`)
- `body` saat memperbaiki release yang sudah ada (`PATCH /releases/{id}`)
- `latest.json`

### Memo: Hindari Em-Dash pada File Commit

Untuk-notes yang dibaca manusia, pakai `-` (hyphen) dan bukan em-dash. Em-dash (`—`) sering tersaji sebagai mojibake (`â€"`) ketika file commit ditulis lewat `Set-Content` atau `Add-Content` dari PowerShell, karena encoding file yang diasumsikan berbeda dengan encoding yang sebenarnya.

Kalau karakter rusak sudah telanjur ter-push ke commit yang sudah ditag, memperbaikinya butuh `git commit --amend` plus `git tag -f` dan `git push --force-with-lease`. Itu menimpa riwayat publik, jadi **tanyakan dulu** sebelum dilakukan.

Setelah menulis pesan commit, periksa sekilas:

```powershell
$notes = [System.IO.File]::ReadAllText("path\commit-msg.txt")
if ($notes -match "[^\x00-\x7E]") { "ADA karakter non-ASCII, periksa" }
```

---

## 7. Bahasa Dokumentasi Releases

Dokumentasi yang dilihat pengguna **wajib ditulis dalam Bahasa Indonesia**. Ini mencakup:

| Dokumen | Bahasa | Lokasi |
| --- | --- | --- |
| **Release Notes GitHub** | Bahasa Indonesia | Body dari GitHub Release |
| **README** | Bahasa Indonesia | `README.md` |
| **Pesan commit** | English | `git log` (konvensi repo yang sudah berjalan) |

### Release Notes
- Tulis dalam Bahasa Indonesia, dengan sub-heading per area fitur bila rilisnya besar.
- Jelaskan **masalah yang diperbaiki dan penyebabnya**, bukan hanya daftar file yang berubah. Nilsainya ada pada alasan di balik perubahan, bukan pada diff-nya.
- Sebutkan risiko atau hal yang perlu dicek pengguna setelah memasang, terutama bila ada migrasi data.
- Nada: lugas dan teknis. Hindari pujian diri sendiri dan marketing.
- Jangan menyebutkan hal yang belum diverifikasi. Bila suatu fitur hanya lolos uji statis (typecheck, unit test, build) dan belum pernah dijalankan di binary sungguhan, nyatakan demikian secara terbuka.

### README
- Struktur README memakai heading bernomor. Saat menambah fitur baru, tambahkan sebagai section bernomor **di akhir** daftar agar penomoran section yang sudah ada tidak berubah.
- SEBELUM menulis deskripsi fitur, **verifikasi dulu ke kode sumbernya** (tab, aksi, dan capability yang benar-benar ada). Jangan menulis Marketing dari asumsi.
- Jika sebuah rilis sebelumnya pernah terbit tanpa masuk README, tambahkan sekaligus.
- Perbarui juga README bila ada perilaku yang berubah atau tidak lagi berlaku (misal: state yang dulu disimpan antar restart, lalu dihapus).
- README memakai `npm run` pada contoh perintah, sementara repo ini memakai `bun`. Ini ketidaksesuaian yang sudah lama ada dan belum pernah dibereskan.

### Verifikasi Pra-Release
Sebelum PUBLISH, jalankan pengecekan berikut agar tidak ada yang tertinggal:

```bash
# 1. Tidak ada nomor versi hardcoded di UI
grep -rnE "0\.[0-9]+\.[0-9]+" apps/desktop/app --include=*.vue --include=*.ts
# Hanya boleh menyisakan IP address (127.0.0.1) dan komentar historis.

# 2. Kualitas kode
bun run typecheck:desktop
bun run test:desktop
```

Versi yang tampil di antarmuka **tidak boleh ditulis manual**. Bacanya dari satu sumber:

- `apps/desktop/package.json` → nilai fallback, diimpor sebagai `pkg.version`
- `getVersion()` dari Tauri runtime → nilai sebenarnya saat aplikasi berjalan

Pengguna/updater bisa membuat nomor versi yang tertulis manual tertinggal beberapa rilis tanpa terlihat. Header aplikasi pernah tertahan di `v0.2.5` selama empat rilis karena ditulis manual.

