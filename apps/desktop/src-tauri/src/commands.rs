use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

use crate::crypto::CryptoEngine;
use crate::dbms::DbmsManager;
use crate::ssh_session::{RemoteFileItem, SshManager};
use crate::sync::{AuthResponse, SyncService, VaultGetResponse, VaultPutRequest};
use crate::vault::VaultData;

pub struct AppState {
    pub current_key: Arc<Mutex<Option<[u8; 32]>>>,
    pub current_password: Arc<Mutex<Option<String>>>,
    pub current_salt: Arc<Mutex<Option<String>>>,
    pub current_vault: Arc<Mutex<VaultData>>,
    pub sync_service: SyncService,
    pub ssh_manager: Arc<SshManager>,
    pub dbms_manager: Arc<DbmsManager>,
}

#[tauri::command]
pub fn ai_set_provider_secret(provider_id: String, secret: String) -> Result<(), String> {
    if provider_id.trim().is_empty() {
        return Err("Provider id kosong.".to_string());
    }
    keyring::Entry::new("BOBA AI Provider", &provider_id)
        .map_err(|e| e.to_string())?
        .set_password(&secret)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_get_provider_secret(provider_id: String) -> Result<Option<String>, String> {
    if provider_id.trim().is_empty() {
        return Err("Provider id kosong.".to_string());
    }
    let entry = keyring::Entry::new("BOBA AI Provider", &provider_id).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn ai_delete_provider_secret(provider_id: String) -> Result<(), String> {
    if provider_id.trim().is_empty() {
        return Err("Provider id kosong.".to_string());
    }
    let entry = keyring::Entry::new("BOBA AI Provider", &provider_id).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// --- E2EE Local Vault & Auth Commands ---

#[tauri::command]
pub fn init_or_unlock_vault(
    state: State<AppState>,
    master_password: String,
    user_salt: String,
) -> Result<bool, String> {
    let key = CryptoEngine::derive_master_key(&master_password, &user_salt)?;
    *state.current_key.lock() = Some(key);
    *state.current_password.lock() = Some(master_password);
    *state.current_salt.lock() = Some(user_salt);
    Ok(true)
}

#[tauri::command]
pub fn change_master_password(
    state: State<AppState>,
    old_password: String,
    new_password: String,
) -> Result<bool, String> {
    let current_pwd = state.current_password.lock().clone();
    let current_salt = state.current_salt.lock().clone();

    match current_pwd {
        Some(ref pwd) if pwd == &old_password => {
            let salt = current_salt.unwrap_or_else(|| crate::crypto::DEFAULT_OFFLINE_SALT.to_string());
            let new_key = CryptoEngine::derive_master_key(&new_password, &salt)?;
            *state.current_key.lock() = Some(new_key);
            *state.current_password.lock() = Some(new_password);
            *state.current_salt.lock() = Some(salt);
            Ok(true)
        }
        Some(_) => Err("Master password lama salah.".to_string()),
        None => Err("Vault belum terbuka (locked).".to_string()),
    }
}

#[tauri::command]
pub fn lock_vault(state: State<AppState>) -> Result<bool, String> {
    *state.current_key.lock() = None;
    *state.current_password.lock() = None;
    *state.current_salt.lock() = None;
    Ok(true)
}

#[tauri::command]
pub fn is_vault_unlocked(state: State<AppState>) -> bool {
    state.current_key.lock().is_some()
}

#[tauri::command]
pub fn save_local_vault(
    state: State<AppState>,
    snapshot: VaultData,
) -> Result<String, String> {
    let (key, password, salt) = {
        (
            *state.current_key.lock(),
            state.current_password.lock().clone(),
            state.current_salt.lock().clone(),
        )
    };

    let serialized = serde_json::to_string(&snapshot)
        .map_err(|e| format!("Failed to serialize vault: {}", e))?;

    let encrypted_blob = if let (Some(pwd), Some(s)) = (password, salt) {
        CryptoEngine::encrypt_with_salt(&pwd, &s, &serialized)?
    } else if let Some(k) = key {
        CryptoEngine::encrypt(&k, &serialized)?
    } else {
        return Err("Vault is locked. Unlock before saving.".to_string());
    };

    *state.current_vault.lock() = snapshot;
    Ok(encrypted_blob)
}

#[tauri::command]
pub fn decrypt_remote_vault_blob(
    state: State<AppState>,
    encrypted_blob: String,
) -> Result<VaultData, String> {
    let (current_key, password, salt) = {
        (
            *state.current_key.lock(),
            state.current_password.lock().clone(),
            state.current_salt.lock().clone(),
        )
    };

    if current_key.is_none() && password.is_none() {
        return Err("Vault is locked. Unlock before decrypting.".to_string());
    }

    let (decrypted, new_derived_key) = CryptoEngine::decrypt_smart(
        current_key,
        password.as_deref(),
        salt.as_deref(),
        &encrypted_blob,
    )?;

    // If a new key was derived (e.g. from salt inside blob), update active key
    if let Some(new_key) = new_derived_key {
        *state.current_key.lock() = Some(new_key);
    }

    let snapshot: VaultData = serde_json::from_str(&decrypted)
        .map_err(|e| format!("Failed to parse decrypted vault data: {}", e))?;

    *state.current_vault.lock() = snapshot.clone();
    Ok(snapshot)
}

// --- Multi-Device Sync Cloud Commands ---

#[tauri::command]
pub async fn sync_register(
    state: State<'_, AppState>,
    server_url: String,
    username: String,
    password_hash: String,
    _salt: String,
) -> Result<AuthResponse, String> {
    state
        .sync_service
        .register(&server_url, &username, &password_hash)
        .await
}

#[tauri::command]
pub async fn sync_login(
    state: State<'_, AppState>,
    server_url: String,
    username: String,
    password_hash: String,
) -> Result<AuthResponse, String> {
    state
        .sync_service
        .login(&server_url, &username, &password_hash)
        .await
}

#[tauri::command]
pub async fn sync_pull_vault(
    state: State<'_, AppState>,
    server_url: String,
    token: String,
) -> Result<VaultGetResponse, String> {
    state.sync_service.get_vault(&server_url, &token).await
}

#[tauri::command]
pub async fn sync_push_vault(
    state: State<'_, AppState>,
    server_url: String,
    token: String,
    snapshot: VaultData,
    expected_version: i64,
) -> Result<i64, String> {
    let (encrypted_data, checksum) = {
        let (key, password, salt) = {
            (
                *state.current_key.lock(),
                state.current_password.lock().clone(),
                state.current_salt.lock().clone(),
            )
        };
        let serialized = serde_json::to_string(&snapshot)
            .map_err(|e| format!("Failed to serialize vault: {}", e))?;
        
        let encrypted = if let (Some(pwd), Some(s)) = (password, salt) {
            CryptoEngine::encrypt_with_salt(&pwd, &s, &serialized)?
        } else if let Some(k) = key {
            CryptoEngine::encrypt(&k, &serialized)?
        } else {
            return Err("Vault is locked. Unlock before syncing.".to_string());
        };
        
        let mut hasher = Sha256::new();
        hasher.update(encrypted.as_bytes());
        let hash = hex::encode(hasher.finalize());
        (encrypted, hash)
    };

    let req = VaultPutRequest {
        expected_version,
        encrypted_data,
        checksum,
    };

    let res = state
        .sync_service
        .push_vault(&server_url, &token, req)
        .await?;

    Ok(res.version)
}

// --- SSH & SFTP Commands ---

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    private_key: Option<String>,
    passphrase: Option<String>,
    cols: u32,
    rows: u32,
    sftp_sudo: Option<bool>,
    sftp_sudo_command: Option<String>,
) -> Result<(), String> {
    state.ssh_manager.connect_async(
        app,
        session_id,
        host,
        port,
        username,
        password,
        private_key,
        passphrase,
        cols,
        rows,
        sftp_sudo,
        sftp_sudo_command,
    ).await
}

#[tauri::command]
pub fn ssh_write(
    state: State<AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state.ssh_manager.write_data(&session_id, data.into_bytes())
}

#[tauri::command]
pub fn ssh_resize(
    state: State<AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    state.ssh_manager.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn ssh_close(
    state: State<AppState>,
    session_id: String,
) -> Result<(), String> {
    state.ssh_manager.close(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn sftp_list(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
) -> Result<Vec<RemoteFileItem>, String> {
    state.ssh_manager.list_dir(&session_id, &remote_path).await
}

#[tauri::command]
pub async fn sftp_read_file(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
) -> Result<String, String> {
    state.ssh_manager.read_file(&session_id, &remote_path).await
}

#[tauri::command]
pub async fn sftp_write_file(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    content: String,
) -> Result<(), String> {
    state.ssh_manager.write_file(&session_id, &remote_path, &content).await
}

#[tauri::command]
pub async fn sftp_download_binary(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
) -> Result<String, String> {
    state.ssh_manager.download_binary(&session_id, &remote_path).await
}

#[tauri::command]
pub async fn sftp_upload_binary(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    base64_data: String,
) -> Result<(), String> {
    state.ssh_manager.upload_binary(&session_id, &remote_path, &base64_data).await
}

#[tauri::command]
pub async fn sftp_delete_path(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    is_dir: bool,
) -> Result<(), String> {
    state.ssh_manager.delete_path(&session_id, &remote_path, is_dir).await
}

#[tauri::command]
pub async fn sftp_create_directory(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
) -> Result<(), String> {
    state.ssh_manager.create_directory(&session_id, &remote_path).await
}

#[tauri::command]
pub async fn sftp_rename_path(
    state: State<'_, AppState>,
    session_id: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    state.ssh_manager.rename_path(&session_id, &old_path, &new_path).await
}

#[tauri::command]
pub async fn sftp_duplicate_path(
    state: State<'_, AppState>,
    session_id: String,
    path: String,
    new_path: String,
) -> Result<(), String> {
    state.ssh_manager.duplicate_path(&session_id, &path, &new_path).await
}

#[tauri::command]
pub async fn sftp_download_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    transfer_id: String,
    remote_path: String,
    local_path: String,
    resume_from: Option<u64>,
) -> Result<(), String> {
    state
        .ssh_manager
        .download_file_stream(app, session_id, transfer_id, remote_path, local_path, resume_from, None, None, false)
        .await
}

#[tauri::command]
pub async fn sftp_upload_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    transfer_id: String,
    local_path: String,
    remote_path: String,
    resume_from: Option<u64>,
) -> Result<(), String> {
    state
        .ssh_manager
        .upload_file_stream(app, session_id, transfer_id, local_path, remote_path, resume_from)
        .await
}

#[tauri::command]
pub fn sftp_cancel_transfer(
    state: State<'_, AppState>,
    transfer_id: String,
) -> Result<(), String> {
    state.ssh_manager.cancel_transfer(&transfer_id);
    Ok(())
}

#[tauri::command]
pub fn sftp_cancel_all(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.ssh_manager.cancel_all_transfers();
    Ok(())
}

#[tauri::command]
pub async fn sftp_set_sudo(
    state: State<'_, AppState>,
    session_id: String,
    enable: bool,
    custom_command: Option<String>,
) -> Result<bool, String> {
    state.ssh_manager.sftp_set_sudo(&session_id, enable, custom_command).await
}

#[tauri::command]
pub fn sftp_get_sudo_status(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<bool, String> {
    Ok(state.ssh_manager.sftp_get_sudo_status(&session_id))
}

#[tauri::command]
pub fn fs_read_text_file(file_path: String) -> Result<String, String> {
    std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read local file: {}", e))
}

#[tauri::command]
pub fn fs_write_text_file(file_path: String, content: String) -> Result<(), String> {
    std::fs::write(&file_path, content).map_err(|e| format!("Failed to write local file: {}", e))
}

#[tauri::command]
pub fn fs_create_dir(dir_path: String) -> Result<(), String> {
    std::fs::create_dir_all(&dir_path).map_err(|e| format!("Failed to create local directory: {}", e))
}

#[tauri::command]
pub fn fs_create_file(file_path: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&file_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::File::create(&file_path).map(|_| ()).map_err(|e| format!("Failed to create local file: {}", e))
}

#[tauri::command]
pub fn fs_delete_path(path: String, is_dir: bool) -> Result<(), String> {
    if is_dir {
        std::fs::remove_dir_all(&path).map_err(|e| format!("Failed to remove local directory: {}", e))
    } else {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to remove local file: {}", e))
    }
}

// ---------------------------------------------------------------------------
// Local state files (deliberately NOT part of the vault)
//
// UI preferences and AI chat history used to live in `localStorage`, where they
// shared a 5 MB origin quota with the encrypted vault. Long tool output filled
// that quota and made every unrelated write throw. They now live in their own
// files under the app data directory, outside the vault and outside cloud sync.
// ---------------------------------------------------------------------------

// No size cap here by design. Chat history is bounded by the user deleting
// threads, not by the app silently trimming them, and it lives in its own file
// so it can no longer crowd out anything else.

/// Resolve a caller-supplied relative path inside the app data directory.
///
/// The path comes from the frontend, so it is untrusted: `..` segments, absolute
/// paths and Windows drive prefixes are rejected rather than normalised, since
/// normalising still leaves room for tricks.
fn local_state_path(app: &AppHandle, relative: &str) -> Result<std::path::PathBuf, String> {
    if relative.is_empty() {
        return Err("Empty local state path".to_string());
    }

    let path = std::path::Path::new(relative);
    let rejects = path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir | std::path::Component::RootDir | std::path::Component::Prefix(_)));
    if rejects {
        return Err(format!("Rejected local state path: {}", relative));
    }
    // A bare file name with no directory would land directly in app_data_dir.
    if path.components().count() < 2 {
        return Err(format!("Local state path needs a directory: {}", relative));
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join(path);
    let parent = dir
        .parent()
        .ok_or_else(|| "Local state path has no parent".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    Ok(dir)
}

/// Read a local state file, or an empty string when there is nothing to read.
///
/// A corrupt file is moved aside rather than deleted so the user can still
/// recover it by hand, and the app starts clean instead of refusing to launch.
#[tauri::command]
pub fn local_state_load(app: AppHandle, relative: String) -> Result<String, String> {
    let path = local_state_path(&app, &relative)?;
    if !path.exists() {
        return Ok(String::new());
    }

    let raw = match std::fs::read_to_string(&path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("BOBA: failed to read local state {}: {}", relative, e);
            return Ok(String::new());
        }
    };

    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(_) => Ok(raw),
        Err(e) => {
            let backup = path.with_extension(format!("corrupt-{}.json", chrono::Utc::now().timestamp()));
            if std::fs::rename(&path, &backup).is_ok() {
                eprintln!(
                    "BOBA: local state {} was not valid JSON ({}); moved to {}",
                    relative,
                    e,
                    backup.display()
                );
            }
            Ok(String::new())
        }
    }
}

/// Write a local state file atomically: temp file, flush, then rename over it.
///
/// A plain `fs::write` would leave a half-written file if the app was killed
/// mid-write, destroying the user's data.
#[tauri::command]
pub fn local_state_save(app: AppHandle, relative: String, content: String) -> Result<(), String> {
    let path = local_state_path(&app, &relative)?;

    let tmp = path.with_extension("tmp");
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&tmp)
            .map_err(|e| format!("Failed to create {}: {}", tmp.display(), e))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write local state: {}", e))?;
        file.sync_all()
            .map_err(|e| format!("Failed to flush local state: {}", e))?;
    }

    std::fs::rename(&tmp, &path)
        .map_err(|e| format!("Failed to replace local state: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn fs_rename_path(old_path: String, new_path: String) -> Result<(), String> {    std::fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename local path: {}", e))
}

#[tauri::command]
pub fn fs_duplicate_path(path: String, new_path: String, is_dir: bool) -> Result<(), String> {
    crate::ssh_session::duplicate_local_path(&path, &new_path, is_dir)
}

#[tauri::command]
pub async fn fs_get_folder_size(dir_path: String) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || {
        fn dir_size(path: &std::path::Path) -> u64 {
            let mut total = 0;
            if let Ok(entries) = std::fs::read_dir(path) {
                for entry in entries.flatten() {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_dir() {
                            total += dir_size(&entry.path());
                        } else {
                            total += meta.len();
                        }
                    }
                }
            }
            total
        }
        Ok(dir_size(std::path::Path::new(&dir_path)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn fs_list_local_dir(dir_path: String) -> Result<Vec<crate::ssh_session::LocalFileItem>, String> {
    crate::ssh_session::list_local_dir(&dir_path)
}

#[tauri::command]
pub fn fs_get_local_drives() -> Vec<crate::ssh_session::LocalDriveItem> {
    crate::ssh_session::get_local_drives()
}

#[tauri::command]
pub fn fs_get_app_data_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    app_handle
        .path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

#[tauri::command]
pub async fn sftp_download_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    transfer_id: Option<String>,
    remote_folder: String,
    local_folder: String,
    concurrency: Option<usize>,
) -> Result<(), String> {
    let tid = transfer_id.unwrap_or_else(|| format!("tx_down_folder_{}", chrono::Utc::now().timestamp_millis()));
    state
        .ssh_manager
        .download_folder_recursive(app, session_id, tid, remote_folder, local_folder, concurrency)
        .await
}

#[tauri::command]
pub async fn sftp_upload_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    transfer_id: Option<String>,
    local_folder: String,
    remote_folder: String,
    concurrency: Option<usize>,
) -> Result<(), String> {
    let tid = transfer_id.unwrap_or_else(|| format!("tx_up_folder_{}", chrono::Utc::now().timestamp_millis()));
    state
        .ssh_manager
        .upload_folder_recursive(app, session_id, tid, local_folder, remote_folder, concurrency)
        .await
}

#[tauri::command]
pub async fn sftp_transfer_remote_to_remote(
    app: AppHandle,
    state: State<'_, AppState>,
    src_session_id: String,
    dst_session_id: String,
    transfer_id: String,
    src_path: String,
    dst_path: String,
    concurrency: Option<usize>,
) -> Result<(), String> {
    state
        .ssh_manager
        .transfer_remote_to_remote(app, src_session_id, dst_session_id, transfer_id, src_path, dst_path, concurrency)
        .await
}

#[tauri::command]
pub fn sftp_set_concurrency(
    state: State<'_, AppState>,
    concurrency: usize,
) -> Result<(), String> {
    state.ssh_manager.set_concurrency(concurrency);
    Ok(())
}

#[tauri::command]
pub fn read_local_private_key_file(file_path: String) -> Result<String, String> {
    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read local private key file: {}", e))
}

#[tauri::command]
pub async fn ssh_get_server_metrics(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<crate::ssh_session::ServerMetrics, String> {
    state.ssh_manager.get_metrics(&session_id).await
}

#[tauri::command]
pub async fn ssh_get_server_metrics_full(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<crate::ssh_session::ServerMetricsFull, String> {
    state.ssh_manager.get_metrics_full(&session_id).await
}

#[tauri::command]
pub async fn ssh_list_running_apps(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<String, String> {
    state.ssh_manager.list_running_apps(&session_id).await
}

#[tauri::command]
pub async fn ssh_start_log_stream(
    state: State<'_, AppState>,
    session_id: String,
    command: String,
    label: String,
) -> Result<String, String> {
    state
        .ssh_manager
        .start_log_stream(&session_id, &command, &label)
        .await
}

#[tauri::command]
pub async fn ssh_stop_log_stream(
    state: State<'_, AppState>,
    stream_id: String,
) -> Result<(), String> {
    state.ssh_manager.stop_log_stream(&stream_id).await
}

#[tauri::command]
pub async fn ssh_list_active_log_streams(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<String>, String> {
    Ok(state.ssh_manager.list_active_streams(&session_id))
}

#[tauri::command]
pub async fn ssh_start_tunnel(
    state: State<'_, AppState>,
    session_id: String,
    tunnel_id: String,
    name: String,
    local_host: String,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
) -> Result<crate::ssh_session::ActiveTunnelInfo, String> {
    state
        .ssh_manager
        .start_tunnel(
            &session_id,
            &tunnel_id,
            &name,
            &local_host,
            local_port,
            &remote_host,
            remote_port,
        )
        .await
}

#[tauri::command]
pub async fn ssh_stop_tunnel(
    state: State<'_, AppState>,
    tunnel_id: String,
) -> Result<(), String> {
    state.ssh_manager.stop_tunnel(&tunnel_id).await
}

#[tauri::command]
pub fn ssh_list_active_tunnels(
    state: State<'_, AppState>,
    session_id: Option<String>,
) -> Result<Vec<crate::ssh_session::ActiveTunnelInfo>, String> {
    Ok(state.ssh_manager.list_active_tunnels(session_id.as_deref()))
}

#[tauri::command]
pub async fn sftp_fix_permissions(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
) -> Result<String, String> {
    state.ssh_manager.fix_web_permissions(&session_id, &remote_path).await
}

#[tauri::command]
pub async fn ssh_exec_command(
    state: State<'_, AppState>,
    session_id: String,
    command: String,
) -> Result<String, String> {
    state.ssh_manager.exec_command(&session_id, &command).await
}

#[tauri::command]
pub async fn open_monitoring_window(
    app_handle: tauri::AppHandle,
    session_id: String,
    title: String,
) -> Result<(), String> {
    use tauri::Manager;
    let win_label = format!("monitoring-{}", session_id.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_"));
    
    if let Some(existing_win) = app_handle.get_webview_window(&win_label) {
        let _ = existing_win.set_focus();
        return Ok(());
    }

    let encoded_sid: String = session_id.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c.to_string() } else { format!("%{:02X}", c as u32) }).collect();
    let encoded_title: String = title.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c.to_string() } else { format!("%{:02X}", c as u32) }).collect();
    let url_str = format!("index.html?window=monitoring&sessionId={}&title={}", encoded_sid, encoded_title);
    let win_title = format!("Monitoring - {}", title);

    tauri::WebviewWindowBuilder::new(
        &app_handle,
        &win_label,
        tauri::WebviewUrl::App(url_str.into()),
    )
    .title(win_title)
    .inner_size(1000.0, 720.0)
    .min_inner_size(800.0, 550.0)
    .resizable(true)
    .decorations(false)
    .shadow(true)
    .build()
    .map_err(|e| format!("Failed to create monitoring window: {}", e))?;

    Ok(())
}

pub fn log_msg(msg: &str) {
    let log_path = match std::env::var("APPDATA") {
        Ok(appdata) => std::path::PathBuf::from(appdata).join("boba").join("boba.log"),
        Err(_) => std::env::temp_dir().join("boba.log"),
    };
    if let Some(p) = log_path.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        use std::io::Write;
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(f, "[{}] {}", now, msg);
    }
}

#[tauri::command]
pub fn get_app_log_path() -> Result<String, String> {
    let log_path = match std::env::var("APPDATA") {
        Ok(appdata) => std::path::PathBuf::from(appdata).join("boba").join("boba.log"),
        Err(_) => std::env::temp_dir().join("boba.log"),
    };
    Ok(log_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_log_file() -> Result<(), String> {
    let path = get_app_log_path()?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if !std::path::Path::new(&path).exists() {
        let _ = std::fs::write(&path, format!("[{}] BOBA log file created.\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("notepad.exe").arg(&path).spawn();
    }
    Ok(())
}

#[tauri::command]
pub fn read_recent_logs() -> Result<String, String> {
    let path = get_app_log_path()?;
    std::fs::read_to_string(&path).map_err(|e| format!("Log belum tersedia: {}", e))
}

#[tauri::command]
pub async fn fetch_ai_models(endpoint: String, api_key: Option<String>) -> Result<Vec<String>, String> {
    use base64::Engine;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let mut req = client.get(&endpoint);
    if let Some(ref key) = api_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            if endpoint.contains("/api/model") {
                let auth_val = format!(
                    "Basic {}",
                    base64::engine::general_purpose::STANDARD.encode(format!("opencode:{}", trimmed))
                );
                req = req.header("Authorization", auth_val);
            } else {
                req = req.header("Authorization", format!("Bearer {}", trimmed));
            }
        }
    }

    let res = req.send().await.map_err(|e| format!("Network request failed: {}", e))?;
    let status = res.status();
    if !status.is_success() {
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP error {}: {}", status, err_body));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| format!("Invalid JSON response: {}", e))?;

    if endpoint.contains("/api/model") {
        if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
            let mut models: Vec<String> = data
                .iter()
                .filter_map(|m| {
                    let p_id = m.get("providerID").and_then(|p| p.as_str()).unwrap_or("");
                    let m_id = m.get("id").and_then(|id| id.as_str()).unwrap_or("");
                    let is_free = m_id.contains("free")
                        || m.get("cost")
                            .and_then(|c| c.as_array())
                            .and_then(|a| a.first())
                            .and_then(|t| t.get("input"))
                            .and_then(|i| i.as_f64())
                            .map(|v| v == 0.0)
                            .unwrap_or(false);

                    if p_id == "opencode" && is_free {
                        Some(m_id.to_string())
                    } else {
                        None
                    }
                })
                .collect();
            models.sort();
            return Ok(models);
        }
    }

    if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
        let mut models: Vec<String> = data
            .iter()
            .filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(|s| s.to_string()))
            .collect();
        models.sort();
        return Ok(models);
    }
    if let Some(models) = json.get("models").and_then(|d| d.as_array()) {
        let mut list: Vec<String> = models
            .iter()
            .filter_map(|m| {
                m.get("name")
                    .or_else(|| m.get("model"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .collect();
        list.sort();
        return Ok(list);
    }

    Ok(vec![])
}

#[derive(serde::Serialize, Clone)]
pub struct AiStreamChunkEvent {
    pub stream_id: String,
    pub chunk: Option<String>,
    pub done: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn ai_http_stream(
    app: AppHandle,
    stream_id: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: String,
) -> Result<(), String> {
    use tauri::Emitter;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let mut req = client.post(&url);
    for (k, v) in headers {
        req = req.header(k, v);
    }

    let mut res = match req.body(body).send().await {
        Ok(r) => r,
        Err(e) => {
            let err_msg = format!("Network request failed: {}", e);
            let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
                stream_id: stream_id.clone(),
                chunk: None,
                done: true,
                error: Some(err_msg.clone()),
            });
            return Err(err_msg);
        }
    };

    let status = res.status();
    if !status.is_success() {
        let err_text = res.text().await.unwrap_or_default();
        let err_msg = format!("API Error [{}]: {}", status, err_text);
        let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
            stream_id: stream_id.clone(),
            chunk: None,
            done: true,
            error: Some(err_msg.clone()),
        });
        return Err(err_msg);
    }

    let mut stream_completed = false;
    while let Ok(Some(chunk)) = res.chunk().await {
        let text = String::from_utf8_lossy(&chunk).to_string();
        let is_done_signal = text.contains("data: [DONE]")
            || text.contains("\"finishReason\":\"STOP\"")
            || text.contains("\"finish_reason\":\"stop\"")
            || text.contains("\"finish_reason\":\"tool_calls\"")
            || text.contains("\"type\":\"message_stop\"");

        let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
            stream_id: stream_id.clone(),
            chunk: Some(text),
            done: is_done_signal,
            error: None,
        });

        if is_done_signal {
            stream_completed = true;
            break;
        }
    }

    if !stream_completed {
        let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
            stream_id,
            chunk: None,
            done: true,
            error: None,
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn ai_opencode_stream(
    app: AppHandle,
    stream_id: String,
    base_url: String,
    password: String,
    model: String,
    prompt: String,
) -> Result<(), String> {
    use base64::Engine;
    use tauri::Emitter;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let clean_url = base_url.trim().trim_end_matches('/');
    let auth_val = format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(format!("opencode:{}", password.trim()))
    );

    // 1. Create session on local OpenCode service
    let session_url = format!("{}/api/session", clean_url);
    let session_body = serde_json::json!({
        "model": {
            "providerID": "opencode",
            "id": model
        }
    });

    let sess_res = client
        .post(&session_url)
        .header("Authorization", &auth_val)
        .header("Content-Type", "application/json")
        .json(&session_body)
        .send()
        .await
        .map_err(|e| format!("Gagal menghubungi OpenCode service di {}: {}", clean_url, e))?;

    if !sess_res.status().is_success() {
        let status = sess_res.status();
        let err = sess_res.text().await.unwrap_or_default();
        let err_msg = format!("OpenCode session error [{}]: {}", status, err);
        let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
            stream_id: stream_id.clone(),
            chunk: None,
            done: true,
            error: Some(err_msg.clone()),
        });
        return Err(err_msg);
    }

    let sess_json: serde_json::Value = sess_res.json().await.map_err(|e| e.to_string())?;
    let session_id = sess_json
        .get("data")
        .and_then(|d| d.get("id"))
        .and_then(|id| id.as_str())
        .ok_or_else(|| "Gagal mendapatkan sessionID dari OpenCode".to_string())?
        .to_string();

    // 2. Connect to SSE event stream
    let event_url = format!("{}/api/event", clean_url);
    let mut event_res = client
        .get(&event_url)
        .header("Authorization", &auth_val)
        .send()
        .await
        .map_err(|e| format!("Gagal subscribe ke OpenCode events: {}", e))?;

    // 3. Send prompt
    let prompt_url = format!("{}/api/session/{}/prompt", clean_url, session_id);
    let prompt_body = serde_json::json!({
        "text": prompt
    });

    let prompt_res = client
        .post(&prompt_url)
        .header("Authorization", &auth_val)
        .header("Content-Type", "application/json")
        .json(&prompt_body)
        .send()
        .await
        .map_err(|e| format!("Gagal mengirim prompt ke OpenCode: {}", e))?;

    if !prompt_res.status().is_success() {
        let status = prompt_res.status();
        let err = prompt_res.text().await.unwrap_or_default();
        let err_msg = format!("OpenCode prompt error [{}]: {}", status, err);
        let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
            stream_id: stream_id.clone(),
            chunk: None,
            done: true,
            error: Some(err_msg.clone()),
        });
        return Err(err_msg);
    }

    // 4. Read SSE event stream chunk by chunk with an overall 180s safety timeout
    let stream_future = async {
        let mut buffer = String::new();
        while let Ok(Some(chunk)) = event_res.chunk().await {
            let text = String::from_utf8_lossy(&chunk);
            buffer.push_str(&text);

            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();

                if line.starts_with("data: ") {
                    let json_str = &line[6..];
                    if let Ok(evt) = serde_json::from_str::<serde_json::Value>(json_str) {
                        let evt_type = evt.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        let evt_sess = evt
                            .get("data")
                            .and_then(|d| d.get("sessionID"))
                            .and_then(|s| s.as_str())
                            .unwrap_or("");

                        if evt_sess == session_id {
                            if evt_type == "session.text.delta" {
                                if let Some(delta) = evt
                                    .get("data")
                                    .and_then(|d| d.get("delta"))
                                    .and_then(|s| s.as_str())
                                {
                                    let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
                                        stream_id: stream_id.clone(),
                                        chunk: Some(delta.to_string()),
                                        done: false,
                                        error: None,
                                    });
                                }
                            } else if evt_type == "session.execution.succeeded"
                                || evt_type == "session.step.ended"
                                || evt_type == "session.idle"
                            {
                                let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
                                    stream_id: stream_id.clone(),
                                    chunk: None,
                                    done: true,
                                    error: None,
                                });
                                return Ok(());
                            } else if evt_type == "session.execution.failed" {
                                let err_msg = evt
                                    .get("data")
                                    .and_then(|d| d.get("error"))
                                    .and_then(|e| e.as_str())
                                    .unwrap_or("OpenCode execution failed")
                                    .to_string();
                                let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
                                    stream_id: stream_id.clone(),
                                    chunk: None,
                                    done: true,
                                    error: Some(err_msg.clone()),
                                });
                                return Err(err_msg);
                            }
                        }
                    }
                }
            }
        }

        let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
            stream_id: stream_id.clone(),
            chunk: None,
            done: true,
            error: None,
        });
        Ok(())
    };

    let stream_result = match tokio::time::timeout(std::time::Duration::from_secs(180), stream_future).await {
        Ok(res) => res,
        Err(_) => {
            let err_msg = "OpenCode stream timeout setelah 180 detik".to_string();
            let _ = app.emit("ai-stream-event", AiStreamChunkEvent {
                stream_id,
                chunk: None,
                done: true,
                error: Some(err_msg.clone()),
            });
            Err(err_msg)
        }
    };

    // Clean up ephemeral session from OpenCode service database in background
    let cleanup_url = format!("{}/api/session/{}", clean_url, session_id);
    let _ = client.delete(&cleanup_url).header("Authorization", &auth_val).send().await;

    stream_result
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ReleaseAssetInfo {
    pub name: String,
    pub size: u64,
    pub download_url: String,
    pub browser_download_url: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AppUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_name: String,
    pub release_notes: String,
    pub published_at: String,
    pub html_url: String,
    pub assets: Vec<ReleaseAssetInfo>,
}

fn parse_semver(v: &str) -> Vec<u64> {
    v.trim_start_matches(|c: char| !c.is_ascii_digit())
        .split('.')
        .filter_map(|part| {
            let num_str = part.chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
            num_str.parse::<u64>().ok()
        })
        .collect()
}

fn is_version_newer(latest: &str, current: &str) -> bool {
    let latest_parts = parse_semver(latest);
    let current_parts = parse_semver(current);

    let max_len = std::cmp::max(latest_parts.len(), current_parts.len());
    for i in 0..max_len {
        let l = latest_parts.get(i).copied().unwrap_or(0);
        let c = current_parts.get(i).copied().unwrap_or(0);
        if l > c {
            return true;
        } else if l < c {
            return false;
        }
    }
    false
}

#[tauri::command]
pub async fn check_app_update(custom_repo: Option<String>, current_version: Option<String>) -> Result<AppUpdateInfo, String> {
    let repo = custom_repo.unwrap_or_else(|| "harian12/BOBA".to_string());
    let curr_ver = current_version.unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());

    let url = format!("https://api.github.com/repos/{}/releases/latest", repo);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("BOBA-Desktop-App")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let res = client
        .get(&url)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Network request failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("GitHub API returned {}: {}", status, body));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| format!("Invalid JSON response: {}", e))?;

    let tag_name = json.get("tag_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let release_name = json.get("name").and_then(|v| v.as_str()).unwrap_or(&tag_name).to_string();
    let release_notes = json.get("body").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let published_at = json.get("published_at").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let html_url = json.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string();

    let latest_ver = if tag_name.starts_with('v') || tag_name.starts_with('V') {
        tag_name[1..].to_string()
    } else {
        tag_name.clone()
    };

    let has_update = is_version_newer(&latest_ver, &curr_ver);

    let mut assets = Vec::new();
    if let Some(arr) = json.get("assets").and_then(|a| a.as_array()) {
        for item in arr {
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let size = item.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            let download_url = item.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let browser_download_url = item.get("browser_download_url").and_then(|v| v.as_str()).unwrap_or("").to_string();

            if !name.is_empty() {
                assets.push(ReleaseAssetInfo {
                    name,
                    size,
                    download_url,
                    browser_download_url,
                });
            }
        }
    }

    Ok(AppUpdateInfo {
        current_version: curr_ver,
        latest_version: latest_ver,
        has_update,
        release_name,
        release_notes,
        published_at,
        html_url,
        assets,
    })
}

fn validate_external_url(url: &str) -> Result<(), String> {
    if url.is_empty() || url.chars().any(char::is_control) {
        return Err("URL tidak valid.".to_string());
    }

    let scheme_end = url
        .find("://")
        .ok_or_else(|| "Hanya URL http:// atau https:// yang diizinkan.".to_string())?;
    let scheme = url[..scheme_end].to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return Err("Hanya URL http:// atau https:// yang diizinkan.".to_string());
    }

    let authority = url[scheme_end + 3..]
        .split(|character| matches!(character, '/' | '?' | '#'))
        .next()
        .unwrap_or_default();
    if authority.is_empty() {
        return Err("URL tidak valid.".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    validate_external_url(&url)?;

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Gagal membuka URL: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Gagal membuka URL: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Gagal membuka URL: {}", e))?;
    }
    Ok(())
}

// --- DBMS Commands ---

#[tauri::command]
pub async fn dbms_test_connection(
    state: State<'_, AppState>,
    config: crate::dbms::DbConnectionConfig,
) -> Result<String, String> {
    state.dbms_manager.test_connection(&config).await
}

#[tauri::command]
pub async fn dbms_get_schema_overview(
    state: State<'_, AppState>,
    config: crate::dbms::DbConnectionConfig,
    selected_db: Option<String>,
) -> Result<crate::dbms::DbSchemaOverview, String> {
    state.dbms_manager.get_schema_overview(&config, selected_db).await
}

#[tauri::command]
pub async fn dbms_execute_query(
    state: State<'_, AppState>,
    config: crate::dbms::DbConnectionConfig,
    selected_db: Option<String>,
    query: String,
) -> Result<Vec<crate::dbms::DbQueryResult>, String> {
    state.dbms_manager.execute_query(&config, selected_db, &query).await
}

#[tauri::command]
pub async fn dbms_get_server_metrics(
    state: State<'_, AppState>,
    config: crate::dbms::DbConnectionConfig,
) -> Result<crate::dbms::DbServerMetrics, String> {
    state.dbms_manager.get_server_metrics(&config).await
}

#[tauri::command]
pub async fn dbms_explain_query(
    state: State<'_, AppState>,
    config: crate::dbms::DbConnectionConfig,
    selected_db: Option<String>,
    query: String,
) -> Result<crate::dbms::DbExplainResult, String> {
    state.dbms_manager.explain_query(&config, selected_db, &query).await
}

#[tauri::command]
pub async fn dbms_get_processlist(
    state: State<'_, AppState>,
    config: crate::dbms::DbConnectionConfig,
) -> Result<Vec<crate::dbms::DbProcessItem>, String> {
    state.dbms_manager.get_processlist(&config).await
}

#[tauri::command]
pub async fn dbms_kill_process(
    state: State<'_, AppState>,
    config: crate::dbms::DbConnectionConfig,
    process_id: i64,
) -> Result<(), String> {
    state.dbms_manager.kill_process(&config, process_id).await
}

#[tauri::command]
pub async fn dbms_get_foreign_keys(
    state: State<'_, AppState>,
    config: crate::dbms::DbConnectionConfig,
    selected_db: Option<String>,
) -> Result<Vec<crate::dbms::DbForeignKeyRelation>, String> {
    state.dbms_manager.get_foreign_keys(&config, selected_db).await
}

#[tauri::command]
pub async fn dbms_get_database_users(
    state: State<'_, AppState>,
    config: crate::dbms::DbConnectionConfig,
) -> Result<Vec<crate::dbms::DbUserItem>, String> {
    state.dbms_manager.get_database_users(&config).await
}

// --- Local AI Provider Auto-Discovery ---

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DetectedAiProvider {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    pub model: String,
    #[serde(rename = "availableModels")]
    pub available_models: Vec<String>,
    pub source: String,
}

pub fn clean_jsonc(input: &str) -> String {
    let mut without_comments = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut in_string = false;
    let mut escape = false;

    while i < len {
        let c = chars[i];
        if in_string {
            without_comments.push(c);
            if escape {
                escape = false;
            } else if c == '\\' {
                escape = true;
            } else if c == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        if c == '"' {
            in_string = true;
            without_comments.push(c);
            i += 1;
            continue;
        }

        if c == '/' && i + 1 < len && chars[i + 1] == '/' {
            i += 2;
            while i < len && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }

        if c == '/' && i + 1 < len && chars[i + 1] == '*' {
            i += 2;
            while i + 1 < len && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            i = (i + 2).min(len);
            continue;
        }

        without_comments.push(c);
        i += 1;
    }

    let chars: Vec<char> = without_comments.chars().collect();
    let len = chars.len();
    let mut out = String::with_capacity(len);
    let mut i = 0;
    in_string = false;
    escape = false;

    while i < len {
        let c = chars[i];
        if in_string {
            out.push(c);
            if escape {
                escape = false;
            } else if c == '\\' {
                escape = true;
            } else if c == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        if c == '"' {
            in_string = true;
            out.push(c);
            i += 1;
            continue;
        }

        if c == ',' {
            let mut j = i + 1;
            while j < len && chars[j].is_whitespace() {
                j += 1;
            }
            if j < len && (chars[j] == '}' || chars[j] == ']') {
                i += 1;
                continue;
            }
        }

        out.push(c);
        i += 1;
    }

    out
}

#[tauri::command]
pub async fn detect_local_ai_providers() -> Result<Vec<DetectedAiProvider>, String> {
    let mut results: Vec<DetectedAiProvider> = Vec::new();
    let mut auth_keys: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let home_opt = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()
        .map(std::path::PathBuf::from);

    if let Some(ref home) = home_opt {
        // 0. OpenCode Local Service (Free Tier Models)
        let service_json_path = home.join(".config").join("opencode").join("service.json");
        let mut service_password = String::new();
        if service_json_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&service_json_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    service_password = json
                        .get("password")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                }
            }
        }

        let mut opencode_url = String::new();
        let status_future = async {
            let direct = tokio::process::Command::new("opencode")
                .args(["service", "status"])
                .output()
                .await;

            match direct {
                Ok(o) => Ok(o),
                Err(_) => {
                    #[cfg(target_os = "windows")]
                    {
                        tokio::process::Command::new("cmd")
                            .args(["/c", "opencode service status"])
                            .output()
                            .await
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        tokio::process::Command::new("sh")
                            .args(["-c", "opencode service status"])
                            .output()
                            .await
                    }
                }
            }
        };

        if let Ok(Ok(out)) = tokio::time::timeout(std::time::Duration::from_millis(1500), status_future).await {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if stdout.starts_with("http://") || stdout.starts_with("https://") {
                    opencode_url = stdout;
                }
            }
        }

        if opencode_url.is_empty() && !service_password.is_empty() {
            opencode_url = "http://127.0.0.1:28894".to_string();
        }

        if !opencode_url.is_empty() && !service_password.is_empty() {
            use base64::Engine;
            let auth_header = format!(
                "Basic {}",
                base64::engine::general_purpose::STANDARD.encode(format!("opencode:{}", service_password))
            );
            let check_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_millis(1500))
                .build();

            if let Ok(http) = check_client {
                let model_api_url = format!("{}/api/model", opencode_url.trim_end_matches('/'));
                if let Ok(resp) = http.get(&model_api_url).header("Authorization", &auth_header).send().await {
                    if resp.status().is_success() {
                        if let Ok(json) = resp.json::<serde_json::Value>().await {
                            if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
                                let free_models: Vec<String> = arr
                                    .iter()
                                    .filter_map(|m| {
                                        let p_id = m.get("providerID").and_then(|p| p.as_str()).unwrap_or("");
                                        let m_id = m.get("id").and_then(|id| id.as_str()).unwrap_or("");
                                        let is_free = m_id.contains("free")
                                            || m.get("cost")
                                                .and_then(|c| c.as_array())
                                                .and_then(|a| a.first())
                                                .and_then(|t| t.get("input"))
                                                .and_then(|i| i.as_f64())
                                                .map(|v| v == 0.0)
                                                .unwrap_or(false);

                                        if p_id == "opencode" && is_free {
                                            Some(m_id.to_string())
                                        } else {
                                            None
                                        }
                                    })
                                    .collect();

                                if !free_models.is_empty() {
                                    let default_model = if free_models.contains(&"flint-40b-free".to_string()) {
                                        "flint-40b-free".to_string()
                                    } else {
                                        free_models.first().cloned().unwrap_or_default()
                                    };

                                    results.push(DetectedAiProvider {
                                        id: "opencode_free_local".to_string(),
                                        name: "OpenCode Free (Lokal PC)".to_string(),
                                        provider_type: "opencode".to_string(),
                                        base_url: opencode_url,
                                        api_key: service_password,
                                        model: default_model,
                                        available_models: free_models,
                                        source: "OpenCode Service (Free Tier)".to_string(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // 1. OpenCode auth.json (~/.local/share/opencode/auth.json)
        let opencode_auth_path = home.join(".local").join("share").join("opencode").join("auth.json");
        if opencode_auth_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&opencode_auth_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(obj) = json.as_object() {
                        for (key, val) in obj {
                            let key_lower = key.to_lowercase();
                            let api_key = val
                                .get("key")
                                .or_else(|| val.get("token"))
                                .or_else(|| val.get("apiKey"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim()
                                .to_string();

                            if !api_key.is_empty() {
                                auth_keys.insert(key_lower.clone(), api_key.clone());

                                let (name, p_type, base_url, model) = match key_lower.as_str() {
                                    "deepseek" => (
                                        "DeepSeek (OpenCode)".to_string(),
                                        "openai".to_string(),
                                        "https://api.deepseek.com/v1".to_string(),
                                        "deepseek-chat".to_string(),
                                    ),
                                    "openai" => (
                                        "OpenAI (OpenCode)".to_string(),
                                        "openai".to_string(),
                                        "https://api.openai.com/v1".to_string(),
                                        "gpt-4o".to_string(),
                                    ),
                                    "anthropic" => (
                                        "Claude (OpenCode)".to_string(),
                                        "anthropic".to_string(),
                                        "https://api.anthropic.com".to_string(),
                                        "claude-3-7-sonnet-20250219".to_string(),
                                    ),
                                    "gemini" => (
                                        "Gemini (OpenCode)".to_string(),
                                        "gemini".to_string(),
                                        "https://generativelanguage.googleapis.com".to_string(),
                                        "gemini-2.0-flash".to_string(),
                                    ),
                                    "openrouter" => (
                                        "OpenRouter (OpenCode)".to_string(),
                                        "openai".to_string(),
                                        "https://openrouter.ai/api/v1".to_string(),
                                        "deepseek/deepseek-chat".to_string(),
                                    ),
                                    "groq" => (
                                        "Groq (OpenCode)".to_string(),
                                        "openai".to_string(),
                                        "https://api.groq.com/openai/v1".to_string(),
                                        "llama-3.3-70b-versatile".to_string(),
                                    ),
                                    _ => (
                                        format!("{} (OpenCode)", key),
                                        "openai".to_string(),
                                        "https://api.openai.com/v1".to_string(),
                                        "".to_string(),
                                    ),
                                };

                                results.push(DetectedAiProvider {
                                    id: format!("opencode_auth_{}", key_lower),
                                    name,
                                    provider_type: p_type,
                                    base_url,
                                    api_key,
                                    model,
                                    available_models: Vec::new(),
                                    source: "OpenCode (auth.json)".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }

        // 2. OpenCode config (~/.config/opencode/opencode.jsonc or opencode.json)
        let config_candidates = [
            home.join(".config").join("opencode").join("opencode.jsonc"),
            home.join(".config").join("opencode").join("opencode.json"),
        ];

        for cfg_path in &config_candidates {
            if cfg_path.exists() {
                if let Ok(raw) = std::fs::read_to_string(cfg_path) {
                    let cleaned = clean_jsonc(&raw);
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&cleaned) {
                        let top_model = json.get("model").and_then(|v| v.as_str()).unwrap_or("");
                        let prov_obj = json
                            .get("provider")
                            .or_else(|| json.get("providers"))
                            .and_then(|v| v.as_object());

                        if let Some(providers) = prov_obj {
                            for (prov_id, prov_val) in providers {
                                let base_url = prov_val
                                    .get("options")
                                    .and_then(|o| o.get("baseURL"))
                                    .or_else(|| prov_val.get("settings").and_then(|s| s.get("baseURL")))
                                    .or_else(|| prov_val.get("baseURL"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .trim()
                                    .to_string();

                                let mut api_key = prov_val
                                    .get("options")
                                    .and_then(|o| o.get("apiKey"))
                                    .or_else(|| prov_val.get("settings").and_then(|s| s.get("apiKey")))
                                    .or_else(|| prov_val.get("apiKey"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .trim()
                                    .to_string();

                                // Resolve {env:VARIABLE_NAME}
                                if api_key.starts_with("{env:") && api_key.ends_with('}') {
                                    let env_name = &api_key[5..api_key.len() - 1];
                                    api_key = std::env::var(env_name).unwrap_or_default();
                                }

                                // Fallback to auth.json credential if config has none
                                if api_key.is_empty() {
                                    if let Some(k) = auth_keys.get(&prov_id.to_lowercase()) {
                                        api_key = k.clone();
                                    }
                                }

                                let mut models = Vec::new();
                                if let Some(m_obj) = prov_val.get("models").and_then(|m| m.as_object()) {
                                    for m_key in m_obj.keys() {
                                        models.push(m_key.clone());
                                    }
                                }

                                let default_model = if !top_model.is_empty() && top_model.starts_with(&format!("{}/", prov_id)) {
                                    top_model[prov_id.len() + 1..].to_string()
                                } else if let Some(first_m) = models.first() {
                                    first_m.clone()
                                } else {
                                    "".to_string()
                                };

                                let p_type = if base_url.contains("anthropic") || prov_id.to_lowercase().contains("anthropic") {
                                    "anthropic"
                                } else if base_url.contains("gemini") || base_url.contains("generativelanguage") || prov_id.to_lowercase().contains("gemini") {
                                    "gemini"
                                } else if base_url.contains("11434") || prov_id.to_lowercase().contains("ollama") {
                                    "ollama"
                                } else {
                                    "openai"
                                };

                                let display_name = prov_val
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or(prov_id)
                                    .to_string();

                                if !base_url.is_empty() || !api_key.is_empty() || !models.is_empty() {
                                    results.push(DetectedAiProvider {
                                        id: format!("opencode_cfg_{}", prov_id),
                                        name: format!("{} (OpenCode)", display_name),
                                        provider_type: p_type.to_string(),
                                        base_url,
                                        api_key,
                                        model: default_model,
                                        available_models: models,
                                        source: "OpenCode Config".to_string(),
                                    });
                                }
                            }
                        }
                    }
                }
                break;
            }
        }

        // 3. Codex CLI (~/.codex/auth.json)
        let codex_auth_path = home.join(".codex").join("auth.json");
        if codex_auth_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&codex_auth_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    let key = json
                        .get("OPENAI_API_KEY")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();

                    // Only import if it's an actual OpenAI API Key (sk-...)
                    if key.starts_with("sk-") {
                        results.push(DetectedAiProvider {
                            id: "codex_cli_openai".to_string(),
                            name: "OpenAI (Codex CLI)".to_string(),
                            provider_type: "openai".to_string(),
                            base_url: "https://api.openai.com/v1".to_string(),
                            api_key: key,
                            model: "gpt-4o".to_string(),
                            available_models: vec![
                                "gpt-4o".to_string(),
                                "gpt-4o-mini".to_string(),
                                "o3-mini".to_string(),
                                "o1".to_string(),
                            ],
                            source: "Codex CLI".to_string(),
                        });
                    }
                }
            }
        }

        // 4. Claude CLI (~/.claude/.credentials.json)
        let claude_cred_path = home.join(".claude").join(".credentials.json");
        if claude_cred_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&claude_cred_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    let token = json
                        .get("claudeAiOauth")
                        .and_then(|o| o.get("accessToken"))
                        .or_else(|| json.get("apiKey"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();

                    if !token.is_empty() && token.starts_with("sk-ant-") {
                        results.push(DetectedAiProvider {
                            id: "claude_cli_anthropic".to_string(),
                            name: "Claude (Claude CLI)".to_string(),
                            provider_type: "anthropic".to_string(),
                            base_url: "https://api.anthropic.com".to_string(),
                            api_key: token,
                            model: "claude-3-7-sonnet-20250219".to_string(),
                            available_models: vec![
                                "claude-3-7-sonnet-20250219".to_string(),
                                "claude-3-5-sonnet-20241022".to_string(),
                                "claude-3-5-haiku-20241022".to_string(),
                            ],
                            source: "Claude CLI".to_string(),
                        });
                    }
                }
            }
        }
    }

    // 5. Ollama Local (http://127.0.0.1:11434/api/tags)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build();

    if let Ok(http) = client {
        if let Ok(res) = http.get("http://127.0.0.1:11434/api/tags").send().await {
            if res.status().is_success() {
                if let Ok(json) = res.json::<serde_json::Value>().await {
                    if let Some(arr) = json.get("models").and_then(|m| m.as_array()) {
                        let models: Vec<String> = arr
                            .iter()
                            .filter_map(|m| {
                                m.get("name")
                                    .or_else(|| m.get("model"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                            })
                            .collect();

                        let default_model = models.first().cloned().unwrap_or_else(|| "llama3.2".to_string());
                        results.push(DetectedAiProvider {
                            id: "local_ollama".to_string(),
                            name: "Ollama (Lokal)".to_string(),
                            provider_type: "ollama".to_string(),
                            base_url: "http://localhost:11434".to_string(),
                            api_key: "".to_string(),
                            model: default_model,
                            available_models: models,
                            source: "Ollama (Lokal)".to_string(),
                        });
                    }
                }
            }
        }
    }

    // 6. OS Environment Variables
    let env_defs = [
        ("OPENAI_API_KEY", "OpenAI (Env)", "openai", "https://api.openai.com/v1", "gpt-4o"),
        ("ANTHROPIC_API_KEY", "Claude (Env)", "anthropic", "https://api.anthropic.com", "claude-3-7-sonnet-20250219"),
        ("DEEPSEEK_API_KEY", "DeepSeek (Env)", "openai", "https://api.deepseek.com/v1", "deepseek-chat"),
        ("GEMINI_API_KEY", "Gemini (Env)", "gemini", "https://generativelanguage.googleapis.com", "gemini-2.0-flash"),
        ("OPENROUTER_API_KEY", "OpenRouter (Env)", "openai", "https://openrouter.ai/api/v1", "deepseek/deepseek-chat"),
    ];

    for (env_var, name, p_type, base_url, model) in &env_defs {
        if let Ok(val) = std::env::var(env_var) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                results.push(DetectedAiProvider {
                    id: format!("env_{}", env_var.to_lowercase()),
                    name: name.to_string(),
                    provider_type: p_type.to_string(),
                    base_url: base_url.to_string(),
                    api_key: trimmed.to_string(),
                    model: model.to_string(),
                    available_models: Vec::new(),
                    source: "Environment Variable".to_string(),
                });
            }
        }
    }

    // 7. Deduplicate & Merge by (provider_type, normalized base_url) or matching ID
    let mut deduped: Vec<DetectedAiProvider> = Vec::new();
    for item in results {
        let normalized_url = item.base_url.trim_end_matches('/').to_lowercase();
        let existing = deduped.iter_mut().find(|d| {
            let same_endpoint = !normalized_url.is_empty()
                && d.base_url.trim_end_matches('/').to_lowercase() == normalized_url
                && d.provider_type == item.provider_type;
            let same_id = d.id == item.id;

            if same_endpoint || same_id {
                if !d.api_key.is_empty() && !item.api_key.is_empty() {
                    d.api_key == item.api_key
                } else {
                    true
                }
            } else {
                false
            }
        });

        if let Some(ext) = existing {
            if ext.api_key.is_empty() && !item.api_key.is_empty() {
                ext.api_key = item.api_key;
            }
            if ext.available_models.is_empty() && !item.available_models.is_empty() {
                ext.available_models = item.available_models;
            }
            if ext.model.is_empty() && !item.model.is_empty() {
                ext.model = item.model;
            }
            if ext.source.contains("auth.json") && item.source.contains("Config") {
                ext.source = item.source;
                ext.name = item.name;
            }
        } else {
            deduped.push(item);
        }
    }

    Ok(deduped)
}

#[cfg(test)]
mod tests {
    use super::{clean_jsonc, validate_external_url};

    #[test]
    fn cleans_jsonc_comments_and_trailing_commas() {
        let jsonc = r#"{
            // line comment
            "provider": {
                /* block comment */
                "name": "test",
                "baseURL": "https://example.com/api", // trailing comma below
            },
        }"#;
        let cleaned = clean_jsonc(jsonc);
        let parsed: serde_json::Value = serde_json::from_str(&cleaned).expect("must parse");
        assert_eq!(parsed["provider"]["name"], "test");
        assert_eq!(parsed["provider"]["baseURL"], "https://example.com/api");
    }

    #[tokio::test]
    async fn tests_opencode_dynamic_detection() {
        let providers = super::detect_local_ai_providers().await.unwrap();
        if let Some(opencode_p) = providers.iter().find(|p| p.provider_type == "opencode") {
            assert!(!opencode_p.available_models.is_empty());
            assert!(
                opencode_p.available_models.contains(&"flint-40b-free".to_string())
                    || opencode_p.available_models.contains(&"big-pickle".to_string())
            );
        }
    }

    #[test]
    fn accepts_http_and_https_urls() {
        assert!(validate_external_url("http://example.com").is_ok());
        assert!(validate_external_url("HTTPS://example.com/path?q=1#fragment").is_ok());
    }

    #[test]
    fn rejects_non_http_schemes_and_empty_authority() {
        assert!(validate_external_url("file:///tmp/example").is_err());
        assert!(validate_external_url("https://").is_err());
    }

    #[test]
    fn rejects_control_characters() {
        assert!(validate_external_url("https://example.com/\nfile").is_err());
        assert!(validate_external_url("https://example.com/\0").is_err());
    }
}
