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
Tauri updater **wajib** memverifikasi tanda tangan digital (*minisign signature*). Tandatangani binary installer menggunakan private key:
```bash
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -Raw "C:\Users\USER\.tauri\boba.key").Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "boba"

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

