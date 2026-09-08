use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tauri::{AppHandle, State};

use crate::crypto::CryptoEngine;
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
        .download_file_stream(app, session_id, transfer_id, remote_path, local_path, resume_from, None)
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

#[tauri::command]
pub fn fs_rename_path(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename local path: {}", e))
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
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let mut req = client.get(&endpoint);
    if let Some(ref key) = api_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", trimmed));
        }
    }

    let res = req.send().await.map_err(|e| format!("Network request failed: {}", e))?;
    let status = res.status();
    if !status.is_success() {
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP error {}: {}", status, err_body));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| format!("Invalid JSON response: {}", e))?;
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
            || text.contains("\"finishReason\":")
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
