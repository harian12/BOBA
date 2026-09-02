pub mod commands;
pub mod crypto;
pub mod ppk;
pub mod ssh_session;
pub mod sync;
pub mod vault;

use commands::AppState;
use parking_lot::Mutex;
use ssh_session::SshManager;
use std::sync::Arc;
use sync::SyncService;
use vault::VaultData;

pub fn run() {
    let app_state = AppState {
        current_key: Arc::new(Mutex::new(None)),
        current_password: Arc::new(Mutex::new(None)),
        current_salt: Arc::new(Mutex::new(None)),
        current_vault: Arc::new(Mutex::new(VaultData::default())),
        sync_service: SyncService::new(),
        ssh_manager: Arc::new(SshManager::new()),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::init_or_unlock_vault,
            commands::lock_vault,
            commands::is_vault_unlocked,
            commands::save_local_vault,
            commands::decrypt_remote_vault_blob,
            commands::sync_register,
            commands::sync_login,
            commands::sync_pull_vault,
            commands::sync_push_vault,
            commands::ssh_connect,
            commands::ssh_write,
            commands::ssh_resize,
            commands::ssh_close,
            commands::sftp_list,
            commands::sftp_read_file,
            commands::sftp_write_file,
            commands::sftp_download_binary,
            commands::sftp_upload_binary,
            commands::sftp_delete_path,
            commands::sftp_create_directory,
            commands::sftp_rename_path,
            commands::sftp_download_stream,
            commands::sftp_upload_stream,
            commands::sftp_cancel_transfer,
            commands::read_local_private_key_file,
            commands::ssh_get_server_metrics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BOBA desktop application");
}
