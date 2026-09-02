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
    let mut key_guard = state.current_key.lock();
    *key_guard = Some(key);
    Ok(true)
}

#[tauri::command]
pub fn lock_vault(state: State<AppState>) -> Result<bool, String> {
    let mut key_guard = state.current_key.lock();
    *key_guard = None;
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
    let key = {
        let key_guard = state.current_key.lock();
        key_guard
            .ok_or_else(|| "Vault is locked. Unlock before saving.".to_string())?
    };

    let serialized = serde_json::to_string(&snapshot)
        .map_err(|e| format!("Failed to serialize vault: {}", e))?;

    let encrypted_blob = CryptoEngine::encrypt(&key, &serialized)?;
    *state.current_vault.lock() = snapshot;
    Ok(encrypted_blob)
}

#[tauri::command]
pub fn decrypt_remote_vault_blob(
    state: State<AppState>,
    encrypted_blob: String,
) -> Result<VaultData, String> {
    let key = {
        let key_guard = state.current_key.lock();
        key_guard
            .ok_or_else(|| "Vault is locked. Unlock before decrypting.".to_string())?
    };

    let decrypted = CryptoEngine::decrypt(&key, &encrypted_blob)?;
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
) -> Result<String, String> {
    let res = state
        .sync_service
        .register(&server_url, &username, &password_hash)
        .await?;
    Ok(res.token)
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
        let key_guard = state.current_key.lock();
        let key = key_guard
            .ok_or_else(|| "Vault is locked. Unlock before syncing.".to_string())?;
        let serialized = serde_json::to_string(&snapshot)
            .map_err(|e| format!("Failed to serialize vault: {}", e))?;
        let encrypted = CryptoEngine::encrypt(&key, &serialized)?;
        
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
pub async fn sftp_download_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    transfer_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    state
        .ssh_manager
        .download_file_stream(app, session_id, transfer_id, remote_path, local_path)
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
) -> Result<(), String> {
    state
        .ssh_manager
        .upload_file_stream(app, session_id, transfer_id, local_path, remote_path)
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
