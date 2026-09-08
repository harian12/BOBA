use async_trait::async_trait;
use parking_lot::Mutex;
use russh::client::{self, Handler};
use russh::ChannelMsg;
use russh_keys::key::KeyPair;
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex as TokioMutex};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use base64::Engine;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_time: i64,
    pub permissions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_hidden: bool,
    pub is_system: bool,
    pub size: u64,
    pub modified_time: i64,
}

pub fn duplicate_local_path(path: &str, new_path: &str, is_dir: bool) -> Result<(), String> {
    if is_dir {
        copy_dir_all(path, new_path)
    } else {
        std::fs::copy(path, new_path).map(|_| ()).map_err(|e| format!("Failed to duplicate local file: {}", e))
    }
}

fn copy_dir_all(src: impl AsRef<std::path::Path>, dst: impl AsRef<std::path::Path>) -> Result<(), String> {
    std::fs::create_dir_all(&dst).map_err(|e| format!("Failed to create directory: {}", e))?;
    for entry in std::fs::read_dir(src).map_err(|e| format!("Failed to read source dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let ty = entry.file_type().map_err(|e| format!("Failed to get file type: {}", e))?;
        let from = entry.path();
        let to = dst.as_ref().join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            std::fs::copy(&from, &to).map_err(|e| format!("Failed to copy file: {}", e))?;
        }
    }
    Ok(())
}

pub fn list_local_dir(dir_path: &str) -> Result<Vec<LocalFileItem>, String> {
    let path = if dir_path.trim().is_empty() {
        std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("C:\\"))
    } else {
        std::path::PathBuf::from(dir_path)
    };

    let entries = std::fs::read_dir(&path)
        .map_err(|e| format!("Failed to read local directory '{}': {}", path.display(), e))?;

    let mut items = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let meta = entry.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_time = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let mut is_hidden = name.starts_with('.');
        let mut is_system = false;

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::fs::MetadataExt;
            if let Some(ref m) = meta {
                let attrs = m.file_attributes();
                // FILE_ATTRIBUTE_HIDDEN = 0x2
                if (attrs & 0x2) != 0 {
                    is_hidden = true;
                }
                // FILE_ATTRIBUTE_SYSTEM = 0x4
                if (attrs & 0x4) != 0 {
                    is_system = true;
                }
            }
            // Filter well-known Windows system root entries like $Recycle.Bin, System Volume Information, dumpstack.log, pagefile.sys, hiberfil.sys
            let upper_name = name.to_uppercase();
            if upper_name.starts_with('$')
                || upper_name == "SYSTEM VOLUME INFORMATION"
                || upper_name == "PAGEFILE.SYS"
                || upper_name == "HIBERFIL.SYS"
                || upper_name == "DUMPSTACK.LOG"
                || upper_name == "SWAPFILE.SYS"
            {
                is_system = true;
            }
        }

        items.push(LocalFileItem {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            is_hidden,
            is_system,
            size,
            modified_time,
        });
    }

    items.sort_by(|a, b| match (b.is_dir, a.is_dir) {
        (true, false) => std::cmp::Ordering::Greater,
        (false, true) => std::cmp::Ordering::Less,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(items)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalDriveItem {
    pub name: String,
    pub path: String,
}

pub fn get_local_drives() -> Vec<LocalDriveItem> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // First item: User Home as default
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            drives.push(LocalDriveItem {
                name: "Home (~/ User)".into(),
                path: userprofile,
            });
        }
        for letter in b'A'..=b'Z' {
            let path_str = format!("{}:\\", letter as char);
            let path = std::path::Path::new(&path_str);
            if path.exists() {
                drives.push(LocalDriveItem {
                    name: format!("Drive ({}:)", letter as char),
                    path: path_str,
                });
            }
        }
        if drives.is_empty() {
            drives.push(LocalDriveItem {
                name: "Drive (C:)".into(),
                path: "C:\\".into(),
            });
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // First item: Home as default
        if let Ok(home) = std::env::var("HOME") {
            drives.push(LocalDriveItem {
                name: "Home (~/)".into(),
                path: home,
            });
        }
        drives.push(LocalDriveItem {
            name: "Root (/)".into(),
            path: "/".into(),
        });
    }

    drives
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    pub transfer_id: String,
    pub session_id: String,
    pub file_name: String,
    pub remote_path: String,
    pub local_path: Option<String>,
    pub direction: String, // "upload" | "download" | "remote-to-remote"
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub percentage: f32,
    pub speed_bps: f64,
    pub status: String, // "pending" | "transferring" | "completed" | "error" | "cancelled"
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerMetrics {
    pub cpu_usage: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub ram_percent: f32,
    pub disk_used: String,
    pub disk_total: String,
    pub disk_percent: f32,
    pub uptime: String,
    pub load_avg: String,
}

#[derive(Clone)]
pub struct ClientHandler;

#[async_trait]
impl Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

pub struct ActiveSession {
    pub session_id: String,
    pub input_tx: mpsc::UnboundedSender<Vec<u8>>,
    pub resize_tx: mpsc::UnboundedSender<(u32, u32)>,
    pub session_handle: Arc<TokioMutex<client::Handle<ClientHandler>>>,
    pub sftp: Option<Arc<SftpSession>>,
    pub sftp_sudo: bool,
    pub sftp_sudo_command: Option<String>,
    pub host: String,
    pub password: Option<String>,
}

#[derive(Clone)]
pub struct SshManager {
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
    active_transfers: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    pub concurrency: Arc<AtomicUsize>,
    active_semaphores: Arc<Mutex<HashMap<u64, (usize, Arc<tokio::sync::Semaphore>)>>>,
    next_semaphore_id: Arc<AtomicU64>,
    pub cancel_epoch: Arc<AtomicU64>,
    pub cancel_notify: Arc<tokio::sync::Notify>,
    pub folder_notifiers: Arc<Mutex<HashMap<String, Arc<tokio::sync::Notify>>>>,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            active_transfers: Arc::new(Mutex::new(HashMap::new())),
            concurrency: Arc::new(AtomicUsize::new(10)),
            active_semaphores: Arc::new(Mutex::new(HashMap::new())),
            next_semaphore_id: Arc::new(AtomicU64::new(1)),
            cancel_epoch: Arc::new(AtomicU64::new(0)),
            cancel_notify: Arc::new(tokio::sync::Notify::new()),
            folder_notifiers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get_concurrency(&self) -> usize {
        self.concurrency.load(Ordering::SeqCst)
    }

    pub fn set_concurrency(&self, new_val: usize) {
        let val = new_val.clamp(1, 20);
        self.concurrency.store(val, Ordering::SeqCst);
        let mut map = self.active_semaphores.lock();
        for (_, (cur_limit, sem)) in map.iter_mut() {
            if val > *cur_limit {
                sem.add_permits(val - *cur_limit);
                *cur_limit = val;
            } else if val < *cur_limit {
                let to_remove = *cur_limit - val;
                if let Ok(permit) = sem.try_acquire_many(to_remove as u32) {
                    permit.forget();
                    *cur_limit = val;
                }
            }
        }
        crate::commands::log_msg(&format!("Concurrency updated to {} across active transfers", val));
    }

    pub fn register_semaphore(&self, initial: usize) -> (u64, Arc<tokio::sync::Semaphore>) {
        let id = self.next_semaphore_id.fetch_add(1, Ordering::SeqCst);
        let sem = Arc::new(tokio::sync::Semaphore::new(initial));
        self.active_semaphores.lock().insert(id, (initial, sem.clone()));
        (id, sem)
    }

    pub fn unregister_semaphore(&self, id: u64) {
        self.active_semaphores.lock().remove(&id);
    }

    pub fn invalidate_sftp(&self, session_id: &str) {
        let mut sessions = self.sessions.lock();
        if let Some(s) = sessions.get_mut(session_id) {
            s.sftp = None;
        }
    }

    /// Parse private key robustly supporting OpenSSH, PKCS#1 (RSA), PKCS#8, PEM, and PuTTY .ppk formats
    pub fn parse_private_key(raw_data: &str, passphrase: Option<&str>) -> Result<KeyPair, String> {
        let clean_key = raw_data.trim().replace("\r\n", "\n").replace('\r', "\n");
        let with_nl = format!("{}\n", clean_key.trim());

        // 1. Try PuTTY .ppk format parser
        if clean_key.starts_with("PuTTY-User-Key-File") {
            return crate::ppk::parse_ppk_to_keypair(&clean_key, passphrase);
        }

        // 2. Try russh_keys native decode (Supports OpenSSH, PKCS#1, PKCS#8)
        if let Ok(kp) = russh_keys::decode_secret_key(&clean_key, passphrase) {
            return Ok(kp);
        }
        if let Ok(kp) = russh_keys::decode_secret_key(&with_nl, passphrase) {
            return Ok(kp);
        }

        // 3. Try parsing via ssh-key crate and re-exporting to standard OpenSSH
        if let Ok(parsed) = ssh_key::PrivateKey::from_openssh(with_nl.as_bytes())
            .or_else(|_| ssh_key::PrivateKey::from_openssh(clean_key.as_bytes()))
        {
            let decrypted = if let Some(pass) = passphrase {
                parsed.decrypt(pass).map_err(|e| format!("Passphrase decryption error: {}", e))?
            } else {
                parsed
            };

            if let Ok(pem_doc) = decrypted.to_openssh(ssh_key::LineEnding::LF) {
                if let Ok(kp) = russh_keys::decode_secret_key(pem_doc.as_str(), None) {
                    return Ok(kp);
                }
            }
        }

        let first_line = clean_key.lines().next().unwrap_or("empty");
        Err(format!(
            "Unsupported private key format (Line 1: '{}'). Please ensure you uploaded a valid Private Key.",
            first_line
        ))
    }

    pub const DEFAULT_SUDO_SFTP_CMD: &'static str = "sudo -n sh -c 'for p in /usr/libexec/openssh/sftp-server /usr/lib/openssh/sftp-server /usr/lib/ssh/sftp-server /usr/libexec/sftp-server; do [ -x \"$p\" ] && exec \"$p\"; done; exec sftp-server'";

    pub async fn connect_async(
        &self,
        app: AppHandle,
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
        let mut ssh_config = client::Config::default();
        ssh_config.keepalive_interval = Some(std::time::Duration::from_secs(15));
        ssh_config.keepalive_max = 4;
        ssh_config.inactivity_timeout = Some(std::time::Duration::from_secs(3600));
        let config = Arc::new(ssh_config);
        let sh = ClientHandler;

        let addr = format!("{}:{}", host, port);
        let mut session = client::connect(config, addr, sh)
            .await
            .map_err(|e| format!("Connection error: {}", e))?;

        let mut auth_ok = false;
        if let Some(pk_data) = private_key {
            let key_pair = Self::parse_private_key(&pk_data, passphrase.as_deref())?;
            auth_ok = session
                .authenticate_publickey(username.clone(), Arc::new(key_pair))
                .await
                .map_err(|e| format!("SSH Key Auth Error: {}", e))?;
        } else if let Some(ref pass) = password {
            auth_ok = session
                .authenticate_password(username.clone(), pass.clone())
                .await
                .map_err(|e| format!("Password auth error: {}", e))?;
        }

        if !auth_ok {
            return Err("Authentication failed: invalid credentials or key not accepted".into());
        }

        // Try early open SFTP channel
        let mut sftp_client_opt = None;
        let is_sudo = sftp_sudo.unwrap_or(false);
        if let Ok(sftp_channel) = session.channel_open_session().await {
            let req_ok = if is_sudo {
                let cmd = sftp_sudo_command.as_deref().unwrap_or(Self::DEFAULT_SUDO_SFTP_CMD);
                sftp_channel.exec(true, cmd).await.is_ok()
            } else {
                sftp_channel.request_subsystem(true, "sftp").await.is_ok()
            };

            if req_ok {
                if let Ok(sftp) = SftpSession::new(sftp_channel.into_stream()).await {
                    sftp_client_opt = Some(Arc::new(sftp));
                }
            }
        }

        // Open Interactive Terminal Channel
        let mut pty_channel = session
            .channel_open_session()
            .await
            .map_err(|e| format!("Interactive channel open failed: {}", e))?;

        pty_channel
            .request_pty(
                true,
                "xterm-256color",
                cols,
                rows,
                0,
                0,
                &[],
            )
            .await
            .map_err(|e| format!("PTY request failed: {}", e))?;

        pty_channel
            .request_shell(true)
            .await
            .map_err(|e| format!("Shell start failed: {}", e))?;

        let (input_tx, mut input_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let (resize_tx, mut resize_rx) = mpsc::unbounded_channel::<(u32, u32)>();

        let active = ActiveSession {
            session_id: session_id.clone(),
            input_tx,
            resize_tx,
            session_handle: Arc::new(TokioMutex::new(session)),
            sftp: sftp_client_opt,
            sftp_sudo: is_sudo,
            sftp_sudo_command,
            host: host.clone(),
            password: password.clone(),
        };

        self.sessions.lock().insert(session_id.clone(), active);

        // Background handler for PTY I/O loop
        let app_clone = app.clone();
        let session_id_clone = session_id.clone();
        let sessions_map = Arc::clone(&self.sessions);

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(input) = input_rx.recv() => {
                        if let Err(_) = pty_channel.data(&input[..]).await {
                            break;
                        }
                    }
                    Some((c, r)) = resize_rx.recv() => {
                        let safe_cols = c.max(10);
                        let safe_rows = r.max(2);
                        let _ = pty_channel.window_change(safe_cols, safe_rows, 0, 0).await;
                    }
                    msg = pty_channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { ref data }) => {
                                let s = String::from_utf8_lossy(data).to_string();
                                let _ = app_clone.emit(&format!("ssh-data:{}", session_id_clone), s);
                            }
                            Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                                let s = String::from_utf8_lossy(data).to_string();
                                let _ = app_clone.emit(&format!("ssh-data:{}", session_id_clone), s);
                            }
                            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }

            sessions_map.lock().remove(&session_id_clone);
            let _ = app_clone.emit(&format!("ssh-closed:{}", session_id_clone), ());
        });

        Ok(())
    }

    /// Execute a quick command in a dedicated session channel and collect output (with 15s timeout)
    pub async fn exec_command(&self, session_id: &str, command: &str) -> Result<String, String> {
        let handle_opt = {
            let sessions = self.sessions.lock();
            sessions.get(session_id).map(|s| s.session_handle.clone())
        };

        if let Some(handle_arc) = handle_opt {
            let command_str = command.to_string();
            let exec_fut = async move {
                let mut channel = {
                    let handle = handle_arc.lock().await;
                    let ch = handle
                        .channel_open_session()
                        .await
                        .map_err(|e| format!("Failed to open exec channel: {}", e))?;

                    ch.exec(true, command_str)
                        .await
                        .map_err(|e| format!("Failed to exec command: {}", e))?;
                    ch
                };

                let mut output = Vec::new();
                while let Some(msg) = channel.wait().await {
                    match msg {
                        ChannelMsg::Data { data } => {
                            output.extend_from_slice(&data);
                        }
                        ChannelMsg::ExtendedData { data, .. } => {
                            output.extend_from_slice(&data);
                        }
                        ChannelMsg::Eof | ChannelMsg::Close => break,
                        _ => {}
                    }
                }

                String::from_utf8(output).map_err(|e| format!("Exec output not UTF-8: {}", e))
            };

            return match tokio::time::timeout(std::time::Duration::from_secs(180), exec_fut).await {
                Ok(res) => res,
                Err(_) => Err("Command timed out after 180s".into()),
            };
        }

        Err("Session not found".into())
    }

    /// Fix web file and folder permissions (directories -> 755, files -> 644)
    pub async fn fix_web_permissions(&self, session_id: &str, path: &str) -> Result<String, String> {
        let clean_path = if path.trim().is_empty() || path == "." { "." } else { path.trim() };
        let (is_sudo, password_opt) = {
            let sessions = self.sessions.lock();
            if let Some(s) = sessions.get(session_id) {
                (s.sftp_sudo, s.password.clone())
            } else {
                (false, None)
            }
        };

        let cmd = if is_sudo {
            format!(
                "sudo find \"{}\" -type d -exec chmod 755 {{}} + 2>/dev/null; sudo find \"{}\" -type f -exec chmod 644 {{}} + 2>/dev/null",
                clean_path, clean_path
            )
        } else if let Some(pass) = password_opt {
            let escaped_pass = pass.replace('\'', "'\\''");
            format!(
                "printf '%s\\n' '{}' | sudo -S -p '' find \"{}\" -type d -exec chmod 755 {{}} + 2>/dev/null; printf '%s\\n' '{}' | sudo -S -p '' find \"{}\" -type f -exec chmod 644 {{}} + 2>/dev/null",
                escaped_pass, clean_path, escaped_pass, clean_path
            )
        } else {
            format!(
                "sudo -n find \"{}\" -type d -exec chmod 755 {{}} + 2>/dev/null; sudo -n find \"{}\" -type f -exec chmod 644 {{}} + 2>/dev/null || find \"{}\" -type d -exec chmod 755 {{}} + 2>/dev/null; find \"{}\" -type f -exec chmod 644 {{}} + 2>/dev/null",
                clean_path, clean_path, clean_path, clean_path
            )
        };

        self.exec_command(session_id, &cmd).await
    }

    /// Fetch server CPU, RAM, Disk, and Uptime metrics
    pub async fn get_metrics(&self, session_id: &str) -> Result<ServerMetrics, String> {
        // Run compact multi-metric script
        let script = r#"
echo "---CPU---"
top -bn1 2>/dev/null | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}'
echo "---RAM---"
free -m 2>/dev/null | awk 'NR==2{printf "%s %s\n", $3,$2}'
echo "---DISK---"
df -h / 2>/dev/null | awk 'NR==2{printf "%s %s %s\n", $3,$2,$5}'
echo "---UPTIME---"
uptime -p 2>/dev/null || uptime 2>/dev/null
echo "---LOAD---"
uptime 2>/dev/null | awk -F'load average:' '{print $2}'
"#;

        let output = self.exec_command(session_id, script).await?;
        let mut metrics = ServerMetrics::default();

        let mut current_section = "";
        for line in output.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("---") && trimmed.ends_with("---") {
                current_section = trimmed;
                continue;
            }
            if trimmed.is_empty() {
                continue;
            }

            match current_section {
                "---CPU---" => {
                    if let Ok(v) = trimmed.parse::<f32>() {
                        metrics.cpu_usage = (v * 10.0).round() / 10.0;
                    }
                }
                "---RAM---" => {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let used = parts[0].parse::<u64>().unwrap_or(0);
                        let total = parts[1].parse::<u64>().unwrap_or(1);
                        metrics.ram_used_mb = used;
                        metrics.ram_total_mb = total;
                        if total > 0 {
                            metrics.ram_percent = ((used as f32 / total as f32) * 1000.0).round() / 10.0;
                        }
                    }
                }
                "---DISK---" => {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() >= 3 {
                        metrics.disk_used = parts[0].to_string();
                        metrics.disk_total = parts[1].to_string();
                        let pct_str = parts[2].trim_end_matches('%');
                        if let Ok(pct) = pct_str.parse::<f32>() {
                            metrics.disk_percent = pct;
                        }
                    }
                }
                "---UPTIME---" => {
                    metrics.uptime = trimmed.to_string();
                }
                "---LOAD---" => {
                    metrics.load_avg = trimmed.to_string();
                }
                _ => {}
            }
        }

        Ok(metrics)
    }

    /// Get active SFTP session or lazily initialize one
    async fn get_or_init_sftp(&self, session_id: &str) -> Result<Arc<SftpSession>, String> {
        let (existing_sftp, handle_opt, is_sudo, sudo_cmd) = {
            let sessions = self.sessions.lock();
            match sessions.get(session_id) {
                Some(s) => (
                    s.sftp.clone(),
                    Some(s.session_handle.clone()),
                    s.sftp_sudo,
                    s.sftp_sudo_command.clone(),
                ),
                None => (None, None, false, None),
            }
        };

        if let Some(sftp) = existing_sftp {
            return Ok(sftp);
        }

        if let Some(handle_arc) = handle_opt {
            let handle = handle_arc.lock().await;
            let sftp_channel = handle
                .channel_open_session()
                .await
                .map_err(|e| format!("Failed to open SFTP session channel: {}", e))?;

            if is_sudo {
                let cmd = sudo_cmd.as_deref().unwrap_or(Self::DEFAULT_SUDO_SFTP_CMD);
                sftp_channel
                    .exec(true, cmd)
                    .await
                    .map_err(|e| format!("Failed to execute sudo SFTP on remote server: {}", e))?;
            } else {
                sftp_channel
                    .request_subsystem(true, "sftp")
                    .await
                    .map_err(|e| format!("Failed to request SFTP subsystem on server: {}", e))?;
            }

            let sftp = SftpSession::new(sftp_channel.into_stream())
                .await
                .map_err(|e| {
                    if is_sudo {
                        format!("Failed to initialize Sudo SFTP client: {}. Pastikan user server memiliki akses sudo tanpa password (NOPASSWD di /etc/sudoers).", e)
                    } else {
                        format!("Failed to initialize SFTP client: {}", e)
                    }
                })?;

            let arc_sftp = Arc::new(sftp);

            // Save to session
            let mut sessions = self.sessions.lock();
            if let Some(s) = sessions.get_mut(session_id) {
                s.sftp = Some(arc_sftp.clone());
            }

            return Ok(arc_sftp);
        }

        Err("SSH session not found or disconnected".into())
    }

    /// Dynamically elevate or demote an active SFTP session to/from Sudo (Root) mode
    pub async fn sftp_set_sudo(
        &self,
        session_id: &str,
        enable: bool,
        custom_command: Option<String>,
    ) -> Result<bool, String> {
        let (handle_arc, pass_opt) = {
            let sessions = self.sessions.lock();
            let s = sessions
                .get(session_id)
                .ok_or_else(|| "Session not found or disconnected".to_string())?;
            (s.session_handle.clone(), s.password.clone())
        };

        let handle = handle_arc.lock().await;
        let sftp_channel = handle
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to open new SFTP channel: {}", e))?;

        if enable {
            let default_cmd = if let Some(pass) = &pass_opt {
                let escaped_pass = pass.replace('\'', "'\\''");
                format!(
                    "printf '%s\\n' '{}' | sudo -S -p '' sh -c 'for p in /usr/libexec/openssh/sftp-server /usr/lib/openssh/sftp-server /usr/lib/ssh/sftp-server /usr/libexec/sftp-server; do [ -x \"$p\" ] && exec \"$p\"; done; exec sftp-server'",
                    escaped_pass
                )
            } else {
                Self::DEFAULT_SUDO_SFTP_CMD.to_string()
            };

            let cmd = match &custom_command {
                Some(c) if !c.trim().is_empty() => c.as_str(),
                _ => default_cmd.as_str(),
            };
            sftp_channel
                .exec(true, cmd)
                .await
                .map_err(|e| format!("Failed to execute sudo SFTP command on remote server: {}", e))?;
        } else {
            sftp_channel
                .request_subsystem(true, "sftp")
                .await
                .map_err(|e| format!("Failed to request standard SFTP subsystem: {}", e))?;
        }

        let sftp = SftpSession::new(sftp_channel.into_stream())
            .await
            .map_err(|e| {
                if enable {
                    format!("Gagal mengaktifkan Sudo SFTP: {}. Pastikan user server memiliki akses sudo tanpa password (NOPASSWD di /etc/sudoers).", e)
                } else {
                    format!("Gagal menghubungkan SFTP standar: {}", e)
                }
            })?;

        let arc_sftp = Arc::new(sftp);

        {
            let mut sessions = self.sessions.lock();
            if let Some(s) = sessions.get_mut(session_id) {
                s.sftp = Some(arc_sftp);
                s.sftp_sudo = enable;
                if custom_command.is_some() {
                    s.sftp_sudo_command = custom_command;
                }
            }
        }

        Ok(enable)
    }

    pub fn sftp_get_sudo_status(&self, session_id: &str) -> bool {
        let sessions = self.sessions.lock();
        sessions.get(session_id).map(|s| s.sftp_sudo).unwrap_or(false)
    }

    pub fn write_data(&self, session_id: &str, data: Vec<u8>) -> Result<(), String> {
        let sessions = self.sessions.lock();
        if let Some(session) = sessions.get(session_id) {
            session
                .input_tx
                .send(data)
                .map_err(|e| format!("Failed to send input: {}", e))?;
            return Ok(());
        }
        Err("Session not found".into())
    }

    pub fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), String> {
        let sessions = self.sessions.lock();
        if let Some(session) = sessions.get(session_id) {
            session
                .resize_tx
                .send((cols, rows))
                .map_err(|e| format!("Failed to send resize: {}", e))?;
            return Ok(());
        }
        Err("Session not found".into())
    }

    pub async fn list_dir(&self, session_id: &str, path: &str) -> Result<Vec<RemoteFileItem>, String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        let target_path = if path.trim().is_empty() || path == "~" { "." } else { path.trim() };
        
        let dir = sftp.read_dir(target_path).await.map_err(|e| format!("SFTP read dir error ({}): {}", target_path, e))?;
        let mut items = Vec::new();
        for entry in dir {
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let full_path = if target_path == "/" {
                format!("/{}", name)
            } else if target_path == "." {
                name.clone()
            } else {
                format!("{}/{}", target_path.trim_end_matches('/'), name)
            };

            let mut is_dir = entry.file_type().is_dir();
            if !is_dir && entry.file_type().is_symlink() {
                if let Ok(target_meta) = sftp.metadata(&full_path).await {
                    if target_meta.is_dir() {
                        is_dir = true;
                    }
                }
            }
            let size = entry.metadata().size.unwrap_or(0);
            let mtime = entry.metadata().mtime.unwrap_or(0) as i64;
            let permissions = entry.metadata().permissions.unwrap_or(0);

            items.push(RemoteFileItem {
                name,
                path: full_path,
                is_dir,
                size,
                modified_time: mtime,
                permissions,
            });
        }

        items.sort_by(|a, b| {
            if a.is_dir == b.is_dir {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            } else if a.is_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        });

        Ok(items)
    }

    pub async fn read_file(&self, session_id: &str, path: &str) -> Result<String, String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        let mut file = sftp.open(path).await.map_err(|e| format!("Failed to open remote file: {}", e))?;
        let mut content = Vec::new();
        file.read_to_end(&mut content).await.map_err(|e| format!("Failed to read file: {}", e))?;
        let _ = file.shutdown().await;
        String::from_utf8(content).map_err(|e| format!("File is not valid UTF-8 text: {}", e))
    }

    pub async fn write_file(&self, session_id: &str, path: &str, content: &str) -> Result<(), String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        let mut file = sftp.create(path).await.map_err(|e| format!("Failed to create remote file: {}", e))?;
        file.write_all(content.as_bytes()).await.map_err(|e| format!("Failed to write file: {}", e))?;
        let _ = file.shutdown().await;

        // Ensure safe web permissions (644) so web server never gets 403 Forbidden
        let _ = sftp.set_metadata(path, russh_sftp::protocol::FileAttributes {
            permissions: Some(0o644),
            ..Default::default()
        }).await;

        Ok(())
    }

    pub async fn download_binary(&self, session_id: &str, path: &str) -> Result<String, String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        let mut file = sftp.open(path).await.map_err(|e| format!("Failed to open remote file: {}", e))?;
        let mut content = Vec::new();
        file.read_to_end(&mut content).await.map_err(|e| format!("Failed to read file: {}", e))?;
        let _ = file.shutdown().await;
        Ok(base64::engine::general_purpose::STANDARD.encode(&content))
    }

    pub async fn upload_binary(&self, session_id: &str, path: &str, base64_data: &str) -> Result<(), String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        let raw_bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| format!("Invalid base64 payload: {}", e))?;

        // Ensure parent directory exists before creating file
        let parent_str = match path.rfind('/') {
            Some(idx) if idx > 0 => &path[..idx],
            Some(0) => "/",
            _ => "",
        };
        if !parent_str.is_empty() && parent_str != "." && parent_str != "/" {
            let _ = self.ensure_dir_exists(session_id, &sftp, parent_str).await;
        }

        let mut file = sftp.create(path).await.map_err(|e| format!("Failed to create remote file: {}", e))?;
        file.write_all(&raw_bytes).await.map_err(|e| format!("Failed to write binary data: {}", e))?;
        let _ = file.shutdown().await;

        let _ = sftp.set_metadata(path, russh_sftp::protocol::FileAttributes {
            permissions: Some(0o644),
            ..Default::default()
        }).await;

        Ok(())
    }

    pub async fn delete_path(&self, session_id: &str, path: &str, is_dir: bool) -> Result<(), String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        if is_dir {
            sftp.remove_dir(path).await.map_err(|e| format!("Failed to remove directory: {}", e))?;
        } else {
            sftp.remove_file(path).await.map_err(|e| format!("Failed to remove file: {}", e))?;
        }
        Ok(())
    }

    pub async fn create_directory(&self, session_id: &str, path: &str) -> Result<(), String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        self.ensure_dir_exists(session_id, &sftp, path).await
    }

    /// Recursively create directories on remote server (like mkdir -p)
    pub async fn mkdir_p_recursive(sftp: &SftpSession, path: &str) -> Result<(), String> {
        let clean = path.replace('\\', "/");
        let parts: Vec<&str> = clean.split('/').filter(|s| !s.is_empty() && *s != ".").collect();
        let is_absolute = clean.starts_with('/');

        let mut current = if is_absolute { String::from("/") } else { String::new() };

        for part in parts {
            if is_absolute && current == "/" {
                current.push_str(part);
            } else if current.is_empty() {
                current.push_str(part);
            } else {
                current.push('/');
                current.push_str(part);
            }

            // Abaikan direktori root sistem yang pasti sudah ada & biasanya restricted
            if current == "/home" || current == "/var" || current == "/usr" || current == "/etc" || current == "/root" || current == "/opt" || current == "/srv" {
                continue;
            }

            // Jika direktori sudah ada, tidak perlu panggil create_dir
            if sftp.metadata(&current).await.is_ok() {
                continue;
            }

            // Attempt to create directory, ignore error if already exists
            let _ = sftp.create_dir(&current).await;
        }

        Ok(())
    }

    /// Robustly ensure a remote directory exists, using SFTP create_dir with fallback to SSH mkdir -p (or sudo mkdir -p)
    pub async fn ensure_dir_exists(&self, session_id: &str, sftp: &SftpSession, path: &str) -> Result<(), String> {
        let clean_raw = path.replace('\\', "/");
        let clean = clean_raw.trim_end_matches('/');
        if clean.is_empty() || clean == "." || clean == "/" {
            return Ok(());
        }

        // 1. Cek dulu apakah direktori sudah ada!
        if sftp.metadata(clean).await.is_ok() {
            return Ok(());
        }

        // 2. Coba lewat standar SFTP mkdir_p
        let _ = Self::mkdir_p_recursive(sftp, clean).await;

        // Cek apakah sudah ada setelah SFTP mkdir_p
        if sftp.metadata(clean).await.is_ok() {
            return Ok(());
        }

        // 3. Fallback SSH shell commands
        let password_opt = {
            let sessions = self.sessions.lock();
            sessions.get(session_id).and_then(|s| s.password.clone())
        };

        // A. Coba shell mkdir -p standar
        let _ = self.exec_command(session_id, &format!("mkdir -p \"{}\"", clean)).await;
        if sftp.metadata(clean).await.is_ok() {
            return Ok(());
        }

        // B. Coba sudo -n (tanpa password) jika server mengizinkan NOPASSWD sudo + chmod 777 agar SFTP non-root bisa menulis
        let sudo_cmd = format!("sudo -n mkdir -p \"{}\" && sudo -n chmod 777 \"{}\"", clean, clean);
        let out_sudo = self.exec_command(session_id, &sudo_cmd).await;
        crate::commands::log_msg(&format!("ensure_dir_exists sudo -n fallback for '{}': {:?}", clean, out_sudo));
        if sftp.metadata(clean).await.is_ok() {
            return Ok(());
        }

        // C. Coba dengan password sesi jika tersedia
        if let Some(pass) = password_opt {
            let escaped_pass = pass.replace('\'', "'\\''");
            let pass_cmd = format!(
                "printf '%s\\n' '{}' | sudo -S -p '' mkdir -p \"{}\" && printf '%s\\n' '{}' | sudo -S -p '' chmod 777 \"{}\"",
                escaped_pass, clean, escaped_pass, clean
            );
            let out_pass = self.exec_command(session_id, &pass_cmd).await;
            crate::commands::log_msg(&format!("ensure_dir_exists sudo -S fallback for '{}': {:?}", clean, out_pass));
            if sftp.metadata(clean).await.is_ok() {
                return Ok(());
            }
        }

        let err_msg = format!(
            "Gagal membuat direktori '{}' di server tujuan (Permission denied). Aktifkan '🛡️ Sudo SFTP' di toolbar atas atau ubah izin folder di server.",
            clean
        );
        crate::commands::log_msg(&err_msg);
        Err(err_msg)
    }

    pub async fn rename_path(&self, session_id: &str, old_path: &str, new_path: &str) -> Result<(), String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        if let Err(e) = sftp.rename(old_path, new_path).await {
            // Fallback: Use shell mv for cross-device links or if sudo permissions are active
            let is_sudo = self.sftp_get_sudo_status(session_id);
            let sudo_pfx = if is_sudo { "sudo " } else { "" };
            let cmd = format!("{}mv \"{}\" \"{}\"", sudo_pfx, old_path, new_path);
            let output = self.exec_command(session_id, &cmd).await.map_err(|e2| {
                format!("Gagal memindahkan '{}' ke '{}': {} (fallback shell: {})", old_path, new_path, e, e2)
            })?;
            if output.contains("mv: cannot") || output.contains("mv: failed") {
                return Err(output);
            }
        }
        Ok(())
    }

    /// Duplicate remote file or folder directly on server via cp -a
    pub async fn duplicate_path(&self, session_id: &str, path: &str, new_path: &str) -> Result<(), String> {
        let is_sudo = self.sftp_get_sudo_status(session_id);
        let sudo_pfx = if is_sudo { "sudo " } else { "" };
        let cmd = format!("{}cp -a \"{}\" \"{}\"", sudo_pfx, path, new_path);
        let output = self.exec_command(session_id, &cmd).await?;
        if output.contains("cp: cannot") || output.contains("cp: failed") {
            return Err(output);
        }
        Ok(())
    }

    /// Cancel an in-progress transfer by transfer_id
    pub fn cancel_transfer(&self, transfer_id: &str) {
        let mut map = self.active_transfers.lock();
        if let Some(flag) = map.remove(transfer_id) {
            flag.store(true, Ordering::SeqCst);
        }
        let mut notifiers = self.folder_notifiers.lock();
        if let Some(notify) = notifiers.remove(transfer_id) {
            notify.notify_waiters();
        }
    }

    /// Cancel all in-progress transfers across all sessions immediately
    pub fn cancel_all_transfers(&self) {
        self.cancel_epoch.fetch_add(1, Ordering::SeqCst);
        self.cancel_notify.notify_waiters();
        let mut notifiers = self.folder_notifiers.lock();
        for (_, notify) in notifiers.drain() {
            notify.notify_waiters();
        }
        let mut map = self.active_transfers.lock();
        for (_, flag) in map.drain() {
            flag.store(true, Ordering::SeqCst);
        }
        crate::commands::log_msg("All active SFTP transfers have been cancelled.");
    }

    /// Stream download remote file directly to local file with real-time progress events and resume support
    pub async fn download_file_stream(
        &self,
        app: AppHandle,
        session_id: String,
        transfer_id: String,
        remote_path: String,
        local_path: String,
        resume_from: Option<u64>,
        parent_cancel: Option<Arc<AtomicBool>>,
    ) -> Result<(), String> {
        let start_epoch = self.cancel_epoch.load(Ordering::SeqCst);
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            self.active_transfers.lock().insert(transfer_id.clone(), cancel_flag.clone());
        }

        if cancel_flag.load(Ordering::SeqCst)
            || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch
            || parent_cancel.as_ref().map_or(false, |p| p.load(Ordering::SeqCst))
        {
            self.active_transfers.lock().remove(&transfer_id);
            return Err("Transfer cancelled by user".into());
        }

        let sftp = match self.get_or_init_sftp(&session_id).await {
            Ok(s) => s,
            Err(e) => {
                let err_msg = format!("Failed to initialize SFTP: {}", e);
                crate::commands::log_msg(&err_msg);
                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: session_id.clone(),
                    file_name: "file".into(),
                    remote_path: remote_path.clone(),
                    local_path: Some(local_path.clone()),
                    direction: "download".into(),
                    bytes_transferred: 0,
                    total_bytes: 0,
                    percentage: 0.0,
                    speed_bps: 0.0,
                    status: "error".into(),
                    error_message: Some(err_msg.clone()),
                });
                self.active_transfers.lock().remove(&transfer_id);
                return Err(err_msg);
            }
        };

        let file_name = std::path::Path::new(&remote_path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| remote_path.clone());

        let file_stat = match sftp.metadata(&remote_path).await {
            Ok(st) => st,
            Err(e) => {
                let err_msg = format!("Failed to stat remote file '{}': {}", remote_path, e);
                crate::commands::log_msg(&err_msg);
                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: session_id.clone(),
                    file_name: file_name.clone(),
                    remote_path: remote_path.clone(),
                    local_path: Some(local_path.clone()),
                    direction: "download".into(),
                    bytes_transferred: 0,
                    total_bytes: 0,
                    percentage: 0.0,
                    speed_bps: 0.0,
                    status: "error".into(),
                    error_message: Some(err_msg.clone()),
                });
                self.active_transfers.lock().remove(&transfer_id);
                return Err(err_msg);
            }
        };
        let total_bytes = file_stat.size.unwrap_or(0);
        let initial_offset = resume_from.unwrap_or(0);

        // Emit transferring status immediately so it shows up in "⚡ Proses" tab
        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            file_name: file_name.clone(),
            remote_path: remote_path.clone(),
            local_path: Some(local_path.clone()),
            direction: "download".into(),
            bytes_transferred: initial_offset,
            total_bytes,
            percentage: if total_bytes > 0 { (initial_offset as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
            speed_bps: 0.0,
            status: "transferring".into(),
            error_message: None,
        });

        let mut remote_file = match sftp.open(&remote_path).await {
            Ok(rf) => rf,
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("handle limit reached") || err_str.contains("Limit exceeded") {
                    crate::commands::log_msg(&format!("Handle limit reached in download. Reconnecting SFTP for session '{}'...", session_id));
                    self.invalidate_sftp(&session_id);
                    if let Ok(new_sftp) = self.get_or_init_sftp(&session_id).await {
                        match new_sftp.open(&remote_path).await {
                            Ok(rf) => rf,
                            Err(e2) => {
                                let err_msg = format!("Failed to open remote file '{}': {}", remote_path, e2);
                                crate::commands::log_msg(&err_msg);
                                let _ = app.emit("sftp-progress", TransferProgress {
                                    transfer_id: transfer_id.clone(),
                                    session_id: session_id.clone(),
                                    file_name: file_name.clone(),
                                    remote_path: remote_path.clone(),
                                    local_path: Some(local_path.clone()),
                                    direction: "download".into(),
                                    bytes_transferred: 0,
                                    total_bytes,
                                    percentage: 0.0,
                                    speed_bps: 0.0,
                                    status: "error".into(),
                                    error_message: Some(err_msg.clone()),
                                });
                                self.active_transfers.lock().remove(&transfer_id);
                                return Err(err_msg);
                            }
                        }
                    } else {
                        let err_msg = format!("Failed to reconnect SFTP after handle limit: {}", e);
                        crate::commands::log_msg(&err_msg);
                        let _ = app.emit("sftp-progress", TransferProgress {
                            transfer_id: transfer_id.clone(),
                            session_id: session_id.clone(),
                            file_name: file_name.clone(),
                            remote_path: remote_path.clone(),
                            local_path: Some(local_path.clone()),
                            direction: "download".into(),
                            bytes_transferred: 0,
                            total_bytes,
                            percentage: 0.0,
                            speed_bps: 0.0,
                            status: "error".into(),
                            error_message: Some(err_msg.clone()),
                        });
                        self.active_transfers.lock().remove(&transfer_id);
                        return Err(err_msg);
                    }
                } else {
                    let err_msg = format!("Failed to open remote file '{}': {}", remote_path, e);
                    crate::commands::log_msg(&err_msg);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: remote_path.clone(),
                        local_path: Some(local_path.clone()),
                        direction: "download".into(),
                        bytes_transferred: 0,
                        total_bytes,
                        percentage: 0.0,
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            }
        };
        
        if let Some(parent) = std::path::Path::new(&local_path).parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }

        let initial_offset = resume_from.unwrap_or(0);
        let mut local_file = if initial_offset > 0 {
            let mut f = tokio::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .open(&local_path)
                .await
                .map_err(|e| format!("Failed to open local destination file for resume: {}", e))?;
            f.seek(std::io::SeekFrom::Start(initial_offset))
                .await
                .map_err(|e| format!("Failed to seek local file: {}", e))?;
            f
        } else {
            tokio::fs::File::create(&local_path)
                .await
                .map_err(|e| format!("Failed to create local destination file: {}", e))?
        };

        if initial_offset > 0 {
            remote_file
                .seek(std::io::SeekFrom::Start(initial_offset))
                .await
                .map_err(|e| format!("Failed to seek remote file: {}", e))?;
        }

        let mut buffer = vec![0u8; 64 * 1024]; // 64 KB chunk
        let mut transferred: u64 = initial_offset;
        let start_time = Instant::now();
        let mut last_emit = Instant::now();

        // Emit transferring status immediately so it shows up in "⚡ Proses" tab
        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            file_name: file_name.clone(),
            remote_path: remote_path.clone(),
            local_path: Some(local_path.clone()),
            direction: "download".into(),
            bytes_transferred: initial_offset,
            total_bytes,
            percentage: if total_bytes > 0 { (initial_offset as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
            speed_bps: 0.0,
            status: "transferring".into(),
            error_message: None,
        });

        loop {
            let is_cancelled = cancel_flag.load(Ordering::SeqCst)
                || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch
                || parent_cancel.as_ref().map_or(false, |p| p.load(Ordering::SeqCst));
            if is_cancelled {
                // Hapus file lokal yang belum selesai agar tidak menjadi file korup di komputer lokal
                drop(local_file);
                let _ = tokio::fs::remove_file(&local_path).await;

                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: session_id.clone(),
                    file_name: file_name.clone(),
                    remote_path: remote_path.clone(),
                    local_path: Some(local_path.clone()),
                    direction: "download".into(),
                    bytes_transferred: transferred,
                    total_bytes,
                    percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                    speed_bps: 0.0,
                    status: "cancelled".into(),
                    error_message: Some("Transfer cancelled by user".into()),
                });
                self.active_transfers.lock().remove(&transfer_id);
                return Err("Transfer cancelled by user".into());
            }

            let n = match remote_file.read(&mut buffer).await {
                Ok(bytes_read) => bytes_read,
                Err(e) => {
                    let err_msg = format!("Error reading remote stream: {}", e);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: remote_path.clone(),
                        local_path: Some(local_path.clone()),
                        direction: "download".into(),
                        bytes_transferred: transferred,
                        total_bytes,
                        percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            };

            if n == 0 {
                break;
            }

            if let Err(e) = local_file.write_all(&buffer[..n]).await {
                let err_msg = format!("Error writing to local file: {}", e);
                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: session_id.clone(),
                    file_name: file_name.clone(),
                    remote_path: remote_path.clone(),
                    local_path: Some(local_path.clone()),
                    direction: "download".into(),
                    bytes_transferred: transferred,
                    total_bytes,
                    percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                    speed_bps: 0.0,
                    status: "error".into(),
                    error_message: Some(err_msg.clone()),
                });
                self.active_transfers.lock().remove(&transfer_id);
                return Err(err_msg);
            }

            transferred += n as u64;

            // Emit progress event every 200ms or on completion
            if last_emit.elapsed().as_millis() > 200 || transferred >= total_bytes {
                let elapsed_secs = start_time.elapsed().as_secs_f64();
                let newly_transferred = transferred.saturating_sub(initial_offset);
                let speed_bps = if elapsed_secs > 0.0 { newly_transferred as f64 / elapsed_secs } else { 0.0 };
                let percentage = if total_bytes > 0 { ((transferred as f32 / total_bytes as f32) * 100.0).min(100.0) } else { 100.0 };

                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: session_id.clone(),
                    file_name: file_name.clone(),
                    remote_path: remote_path.clone(),
                    local_path: Some(local_path.clone()),
                    direction: "download".into(),
                    bytes_transferred: transferred,
                    total_bytes,
                    percentage,
                    speed_bps,
                    status: if transferred >= total_bytes { "completed".into() } else { "transferring".into() },
                    error_message: None,
                });
                last_emit = Instant::now();
            }

            if total_bytes > 0 && transferred >= total_bytes {
                break;
            }
        }

        let _ = local_file.flush().await;
        let _ = tokio::time::timeout(std::time::Duration::from_secs(10), remote_file.shutdown()).await;
        self.active_transfers.lock().remove(&transfer_id);

        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            file_name,
            remote_path,
            local_path: Some(local_path),
            direction: "download".into(),
            bytes_transferred: transferred,
            total_bytes,
            percentage: 100.0,
            speed_bps: 0.0,
            status: "completed".into(),
            error_message: None,
        });

        Ok(())
    }

    /// Stream upload local file directly to remote file with real-time progress events and resume support
    pub async fn upload_file_stream(
        &self,
        app: AppHandle,
        session_id: String,
        transfer_id: String,
        local_path: String,
        remote_path: String,
        resume_from: Option<u64>,
    ) -> Result<(), String> {
        self.upload_file_stream_fast(
            app,
            session_id,
            None,
            transfer_id,
            local_path,
            remote_path,
            resume_from,
            None,
            true, // single file upload sets web permissions
            None,
        ).await
    }

    pub async fn upload_file_stream_fast(
        &self,
        app: AppHandle,
        session_id: String,
        sftp_opt: Option<Arc<SftpSession>>,
        transfer_id: String,
        local_path: String,
        remote_path: String,
        resume_from: Option<u64>,
        known_dirs: Option<Arc<std::sync::Mutex<std::collections::HashSet<String>>>>,
        set_web_permissions: bool,
        parent_cancel: Option<Arc<AtomicBool>>,
    ) -> Result<(), String> {
        let start_epoch = self.cancel_epoch.load(Ordering::SeqCst);
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            self.active_transfers.lock().insert(transfer_id.clone(), cancel_flag.clone());
        }

        if cancel_flag.load(Ordering::SeqCst)
            || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch
            || parent_cancel.as_ref().map_or(false, |p| p.load(Ordering::SeqCst))
        {
            self.active_transfers.lock().remove(&transfer_id);
            return Err("Transfer cancelled by user".into());
        }

        let mut local_file = match tokio::fs::File::open(&local_path).await {
            Ok(f) => f,
            Err(e) => {
                let err_msg = format!("Failed to open local file '{}': {}", local_path, e);
                crate::commands::log_msg(&err_msg);
                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: session_id.clone(),
                    file_name: "file".into(),
                    remote_path: remote_path.clone(),
                    local_path: Some(local_path.clone()),
                    direction: "upload".into(),
                    bytes_transferred: 0,
                    total_bytes: 0,
                    percentage: 0.0,
                    speed_bps: 0.0,
                    status: "error".into(),
                    error_message: Some(err_msg.clone()),
                });
                self.active_transfers.lock().remove(&transfer_id);
                return Err(err_msg);
            }
        };

        let meta = local_file.metadata().await.map_err(|e| format!("Failed to read local file metadata: {}", e))?;
        let total_bytes = meta.len();
        let file_name = std::path::Path::new(&local_path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| local_path.clone());

        let initial_offset = resume_from.unwrap_or(0);

        // Emit transferring status immediately so it shows up in "⚡ Proses" tab
        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            file_name: file_name.clone(),
            remote_path: remote_path.clone(),
            local_path: Some(local_path.clone()),
            direction: "upload".into(),
            bytes_transferred: initial_offset,
            total_bytes,
            percentage: if total_bytes > 0 { (initial_offset as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
            speed_bps: 0.0,
            status: "transferring".into(),
            error_message: None,
        });

        let sftp = match sftp_opt {
            Some(s) => s,
            None => match self.get_or_init_sftp(&session_id).await {
                Ok(s) => s,
                Err(e) => {
                    let err_msg = format!("Failed to initialize SFTP: {}", e);
                    crate::commands::log_msg(&err_msg);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: remote_path.clone(),
                        local_path: Some(local_path.clone()),
                        direction: "upload".into(),
                        bytes_transferred: 0,
                        total_bytes,
                        percentage: 0.0,
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            },
        };

        let parent_str = match remote_path.rfind('/') {
            Some(idx) if idx > 0 => remote_path[..idx].to_string(),
            Some(0) => "/".to_string(),
            _ => "".to_string(),
        };
        if !parent_str.is_empty() && parent_str != "." && parent_str != "/" {
            let is_known = if let Some(ref kd) = known_dirs {
                kd.lock().unwrap().contains(&parent_str)
            } else {
                false
            };
            if !is_known {
                let _ = self.ensure_dir_exists(&session_id, &sftp, &parent_str).await;
                if let Some(ref kd) = known_dirs {
                    kd.lock().unwrap().insert(parent_str);
                }
            }
        }

        let mut remote_file = if initial_offset > 0 {
            let mut rf = match sftp
                .open_with_flags(
                    &remote_path,
                    russh_sftp::protocol::OpenFlags::WRITE | russh_sftp::protocol::OpenFlags::CREATE,
                )
                .await {
                    Ok(f) => f,
                    Err(e) => {
                        let err_str = e.to_string();
                        if err_str.contains("handle limit reached") || err_str.contains("Limit exceeded") {
                            crate::commands::log_msg(&format!("Handle limit reached on upload resume. Reconnecting SFTP for session '{}'...", session_id));
                            self.invalidate_sftp(&session_id);
                            let new_sftp = self.get_or_init_sftp(&session_id).await.map_err(|e| format!("Failed to reinit SFTP: {}", e))?;
                            new_sftp.open_with_flags(
                                &remote_path,
                                russh_sftp::protocol::OpenFlags::WRITE | russh_sftp::protocol::OpenFlags::CREATE,
                            ).await.map_err(|e| format!("Failed to open remote file after reconnect: {}", e))?
                        } else {
                            let err_msg = format!("Failed to open remote file for resume: {}", e);
                            crate::commands::log_msg(&err_msg);
                            let _ = app.emit("sftp-progress", TransferProgress {
                                transfer_id: transfer_id.clone(),
                                session_id: session_id.clone(),
                                file_name: file_name.clone(),
                                remote_path: remote_path.clone(),
                                local_path: Some(local_path.clone()),
                                direction: "upload".into(),
                                bytes_transferred: 0,
                                total_bytes,
                                percentage: 0.0,
                                speed_bps: 0.0,
                                status: "error".into(),
                                error_message: Some(err_msg.clone()),
                            });
                            self.active_transfers.lock().remove(&transfer_id);
                            return Err(err_msg);
                        }
                    }
                };
            rf.seek(std::io::SeekFrom::Start(initial_offset))
                .await
                .map_err(|e| format!("Failed to seek remote file: {}", e))?;
            local_file
                .seek(std::io::SeekFrom::Start(initial_offset))
                .await
                .map_err(|e| format!("Failed to seek local file: {}", e))?;
            rf
        } else {
            match sftp.create(&remote_path).await {
                Ok(f) => f,
                Err(e) => {
                    let err_str = e.to_string();
                    if err_str.contains("handle limit reached") || err_str.contains("Limit exceeded") {
                        crate::commands::log_msg(&format!("Handle limit reached on upload create. Reconnecting SFTP for session '{}'...", session_id));
                        self.invalidate_sftp(&session_id);
                        let new_sftp = self.get_or_init_sftp(&session_id).await.map_err(|e| format!("Failed to reinit SFTP: {}", e))?;
                        match new_sftp.create(&remote_path).await {
                            Ok(f) => f,
                            Err(e2) => {
                                let err_msg = format!("Failed to create destination remote file '{}': {}", remote_path, e2);
                                crate::commands::log_msg(&err_msg);
                                let _ = app.emit("sftp-progress", TransferProgress {
                                    transfer_id: transfer_id.clone(),
                                    session_id: session_id.clone(),
                                    file_name: file_name.clone(),
                                    remote_path: remote_path.clone(),
                                    local_path: Some(local_path.clone()),
                                    direction: "upload".into(),
                                    bytes_transferred: 0,
                                    total_bytes,
                                    percentage: 0.0,
                                    speed_bps: 0.0,
                                    status: "error".into(),
                                    error_message: Some(err_msg.clone()),
                                });
                                self.active_transfers.lock().remove(&transfer_id);
                                return Err(err_msg);
                            }
                        }
                    } else {
                        let err_msg = format!("Failed to create destination remote file '{}': {}", remote_path, e);
                        crate::commands::log_msg(&err_msg);
                        let _ = app.emit("sftp-progress", TransferProgress {
                            transfer_id: transfer_id.clone(),
                            session_id: session_id.clone(),
                            file_name: file_name.clone(),
                            remote_path: remote_path.clone(),
                            local_path: Some(local_path.clone()),
                            direction: "upload".into(),
                            bytes_transferred: 0,
                            total_bytes,
                            percentage: 0.0,
                            speed_bps: 0.0,
                            status: "error".into(),
                            error_message: Some(err_msg.clone()),
                        });
                        self.active_transfers.lock().remove(&transfer_id);
                        return Err(err_msg);
                    }
                }
            }
        };

        let mut buffer = vec![0u8; 64 * 1024]; // 64 KB chunk
        let mut transferred: u64 = initial_offset;
        let start_time = Instant::now();
        let mut last_emit = Instant::now();

        loop {
            let is_cancelled = cancel_flag.load(Ordering::SeqCst)
                || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch
                || parent_cancel.as_ref().map_or(false, |p| p.load(Ordering::SeqCst));
            if is_cancelled {
                // Hapus file remote yang belum selesai ditransfer agar tidak menjadi file korup di server
                let _ = remote_file.shutdown().await;
                let _ = sftp.remove_file(&remote_path).await;

                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: session_id.clone(),
                    file_name: file_name.clone(),
                    remote_path: remote_path.clone(),
                    local_path: Some(local_path.clone()),
                    direction: "upload".into(),
                    bytes_transferred: transferred,
                    total_bytes,
                    percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                    speed_bps: 0.0,
                    status: "cancelled".into(),
                    error_message: Some("Transfer cancelled by user".into()),
                });
                self.active_transfers.lock().remove(&transfer_id);
                return Err("Transfer cancelled by user".into());
            }

            let n = match local_file.read(&mut buffer).await {
                Ok(bytes_read) => bytes_read,
                Err(e) => {
                    let _ = remote_file.shutdown().await;
                    let err_msg = format!("Error reading local stream: {}", e);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: remote_path.clone(),
                        local_path: Some(local_path.clone()),
                        direction: "upload".into(),
                        bytes_transferred: transferred,
                        total_bytes,
                        percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            };

            if n == 0 {
                break;
            }

            if let Err(e) = remote_file.write_all(&buffer[..n]).await {
                let _ = remote_file.shutdown().await;
                let err_msg = format!("Error writing to remote file: {}", e);
                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: session_id.clone(),
                    file_name: file_name.clone(),
                    remote_path: remote_path.clone(),
                    local_path: Some(local_path.clone()),
                    direction: "upload".into(),
                    bytes_transferred: transferred,
                    total_bytes,
                    percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                    speed_bps: 0.0,
                    status: "error".into(),
                    error_message: Some(err_msg.clone()),
                });
                self.active_transfers.lock().remove(&transfer_id);
                return Err(err_msg);
            }

            transferred += n as u64;

            // Emit progress event every 200ms or on completion
            if last_emit.elapsed().as_millis() > 200 || transferred >= total_bytes {
                let elapsed_secs = start_time.elapsed().as_secs_f64();
                let newly_transferred = transferred.saturating_sub(initial_offset);
                let speed_bps = if elapsed_secs > 0.0 { newly_transferred as f64 / elapsed_secs } else { 0.0 };
                let percentage = if total_bytes > 0 { ((transferred as f32 / total_bytes as f32) * 100.0).min(100.0) } else { 100.0 };

                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: session_id.clone(),
                    file_name: file_name.clone(),
                    remote_path: remote_path.clone(),
                    local_path: Some(local_path.clone()),
                    direction: "upload".into(),
                    bytes_transferred: transferred,
                    total_bytes,
                    percentage,
                    speed_bps,
                    status: if transferred >= total_bytes { "completed".into() } else { "transferring".into() },
                    error_message: None,
                });
                last_emit = Instant::now();
            }

            if total_bytes > 0 && transferred >= total_bytes {
                break;
            }
        }

        let _ = tokio::time::timeout(std::time::Duration::from_secs(10), remote_file.shutdown()).await;

        if set_web_permissions {
            // Ensure safe web permissions (644) so web server never gets 403 Forbidden
            let _ = tokio::time::timeout(std::time::Duration::from_secs(5), sftp.set_metadata(&remote_path, russh_sftp::protocol::FileAttributes {
                permissions: Some(0o644),
                ..Default::default()
            })).await;
        }

        self.active_transfers.lock().remove(&transfer_id);

        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            file_name,
            remote_path,
            local_path: Some(local_path),
            direction: "upload".into(),
            bytes_transferred: transferred,
            total_bytes,
            percentage: 100.0,
            speed_bps: 0.0,
            status: "completed".into(),
            error_message: None,
        });

        Ok(())
    }

    /// Direct Server-to-Server file transfer piped in RAM memory (no local disk touch)
    pub async fn transfer_remote_to_remote(
        &self,
        app: AppHandle,
        src_session_id: String,
        dst_session_id: String,
        transfer_id: String,
        src_path: String,
        dst_path: String,
        concurrency: Option<usize>,
    ) -> Result<(), String> {
        let src_sftp = self.get_or_init_sftp(&src_session_id).await?;
        let src_meta = src_sftp
            .metadata(&src_path)
            .await
            .map_err(|e| format!("Failed to get source remote metadata: {}", e))?;

        if src_meta.is_dir() {
            let res = self.transfer_remote_to_remote_folder_recursive(
                app.clone(),
                src_session_id.clone(),
                dst_session_id.clone(),
                transfer_id.clone(),
                src_path.clone(),
                dst_path.clone(),
                concurrency,
            ).await;

            let file_name = std::path::Path::new(&src_path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| src_path.clone());

            let _ = app.emit("sftp-progress", TransferProgress {
                transfer_id: transfer_id.clone(),
                session_id: src_session_id.clone(),
                file_name: format!("📁 {}", file_name),
                remote_path: src_path.clone(),
                local_path: Some(dst_path.clone()),
                direction: "remote-to-remote".into(),
                bytes_transferred: 0,
                total_bytes: 0,
                percentage: 100.0,
                speed_bps: 0.0,
                status: if res.is_ok() { "completed".into() } else { "error".into() },
                error_message: res.as_ref().err().cloned(),
            });

            return res;
        }

        self.transfer_remote_to_remote_file(
            app,
            src_session_id,
            dst_session_id,
            transfer_id,
            src_path,
            dst_path,
            src_meta.size.unwrap_or(0),
        ).await
    }

    /// Single file stream transfer directly between two remote servers via RAM memory pipe
    pub async fn transfer_remote_to_remote_file(
        &self,
        app: AppHandle,
        src_session_id: String,
        dst_session_id: String,
        transfer_id: String,
        src_path: String,
        dst_path: String,
        total_bytes: u64,
    ) -> Result<(), String> {
        self.transfer_remote_to_remote_file_fast(
            app,
            src_session_id,
            dst_session_id,
            None,
            None,
            transfer_id,
            src_path,
            dst_path,
            total_bytes,
            None,
            true, // single file: set web permissions
            None,
        ).await
    }

    pub async fn transfer_remote_to_remote_file_fast(
        &self,
        app: AppHandle,
        src_session_id: String,
        dst_session_id: String,
        src_sftp_opt: Option<Arc<SftpSession>>,
        dst_sftp_opt: Option<Arc<SftpSession>>,
        transfer_id: String,
        src_path: String,
        dst_path: String,
        total_bytes: u64,
        known_dirs: Option<Arc<std::sync::Mutex<std::collections::HashSet<String>>>>,
        set_web_permissions: bool,
        parent_cancel: Option<Arc<AtomicBool>>,
    ) -> Result<(), String> {
        let start_epoch = self.cancel_epoch.load(Ordering::SeqCst);
        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.active_transfers
            .lock()
            .insert(transfer_id.clone(), cancel_flag.clone());

        if cancel_flag.load(Ordering::SeqCst)
            || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch
            || parent_cancel.as_ref().map_or(false, |p| p.load(Ordering::SeqCst))
        {
            self.active_transfers.lock().remove(&transfer_id);
            return Err("Transfer cancelled by user".into());
        }

        let file_name = src_path
            .split('/')
            .last()
            .unwrap_or(&src_path)
            .to_string();

        // 1. Pancarkan status "transferring" segera saat worker mulai memproses file ini
        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: src_session_id.clone(),
            file_name: file_name.clone(),
            remote_path: src_path.clone(),
            local_path: Some(dst_path.clone()),
            direction: "remote-to-remote".into(),
            bytes_transferred: 0,
            total_bytes,
            percentage: 0.0,
            speed_bps: 0.0,
            status: "transferring".into(),
            error_message: None,
        });

        let src_sftp = match src_sftp_opt {
            Some(s) => s,
            None => match self.get_or_init_sftp(&src_session_id).await {
                Ok(s) => s,
                Err(e) => {
                    let err_msg = format!("Failed to connect to source SFTP: {}", e);
                    crate::commands::log_msg(&err_msg);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: src_session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: dst_path.clone(),
                        local_path: Some(format!("Remote:{}", src_session_id)),
                        direction: "remote-to-remote".into(),
                        bytes_transferred: 0,
                        total_bytes,
                        percentage: 0.0,
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            },
        };

        let dst_sftp = match dst_sftp_opt {
            Some(s) => s,
            None => match self.get_or_init_sftp(&dst_session_id).await {
                Ok(s) => s,
                Err(e) => {
                    let err_msg = format!("Failed to connect to destination SFTP: {}", e);
                    crate::commands::log_msg(&err_msg);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: src_session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: src_path.clone(),
                        local_path: Some(dst_path.clone()),
                        direction: "remote-to-remote".into(),
                        bytes_transferred: 0,
                        total_bytes,
                        percentage: 0.0,
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            },
        };

        let mut src_file = match src_sftp.open(&src_path).await {
            Ok(f) => f,
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("handle limit reached")
                    || err_str.contains("Limit exceeded")
                    || err_str.contains("session closed")
                    || err_str.contains("Timeout")
                    || err_str.contains("channel closed")
                {
                    crate::commands::log_msg(&format!("Transient SFTP error on src ({}). Reconnecting SFTP for session '{}'...", err_str, src_session_id));
                    self.invalidate_sftp(&src_session_id);
                    let new_src = self.get_or_init_sftp(&src_session_id).await.map_err(|e| format!("Failed to reinit SFTP on src: {}", e))?;
                    match new_src.open(&src_path).await {
                        Ok(f) => f,
                        Err(e2) => {
                            let err_msg = format!("Failed to open source remote file '{}': {}", src_path, e2);
                            crate::commands::log_msg(&err_msg);
                            let _ = app.emit("sftp-progress", TransferProgress {
                                transfer_id: transfer_id.clone(),
                                session_id: src_session_id.clone(),
                                file_name: file_name.clone(),
                                remote_path: src_path.clone(),
                                local_path: Some(dst_path.clone()),
                                direction: "remote-to-remote".into(),
                                bytes_transferred: 0,
                                total_bytes,
                                percentage: 0.0,
                                speed_bps: 0.0,
                                status: "error".into(),
                                error_message: Some(err_msg.clone()),
                            });
                            self.active_transfers.lock().remove(&transfer_id);
                            return Err(err_msg);
                        }
                    }
                } else {
                    let err_msg = format!("Failed to open source remote file '{}': {}", src_path, e);
                    crate::commands::log_msg(&err_msg);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: src_session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: src_path.clone(),
                        local_path: Some(dst_path.clone()),
                        direction: "remote-to-remote".into(),
                        bytes_transferred: 0,
                        total_bytes,
                        percentage: 0.0,
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            }
        };

        // Pastikan parent directory selalu dibuat di destination sebelum create file (FAST cache)
        let parent_str = match dst_path.rfind('/') {
            Some(idx) if idx > 0 => dst_path[..idx].to_string(),
            Some(0) => "/".to_string(),
            _ => "".to_string(),
        };
        if !parent_str.is_empty() && parent_str != "." && parent_str != "/" {
            let is_known = if let Some(ref kd) = known_dirs {
                kd.lock().unwrap().contains(&parent_str)
            } else {
                false
            };

            if !is_known {
                if let Err(e) = self.ensure_dir_exists(&dst_session_id, &dst_sftp, &parent_str).await {
                    let _ = src_file.shutdown().await;
                    let err_msg = format!("Failed to create destination folder '{}': {}", parent_str, e);
                    crate::commands::log_msg(&err_msg);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: src_session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: src_path.clone(),
                        local_path: Some(dst_path.clone()),
                        direction: "remote-to-remote".into(),
                        bytes_transferred: 0,
                        total_bytes,
                        percentage: 0.0,
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
                if let Some(ref kd) = known_dirs {
                    kd.lock().unwrap().insert(parent_str);
                }
            }
        }

        let mut dst_file = match dst_sftp.create(&dst_path).await {
            Ok(f) => f,
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("handle limit reached")
                    || err_str.contains("Limit exceeded")
                    || err_str.contains("session closed")
                    || err_str.contains("Timeout")
                    || err_str.contains("channel closed")
                {
                    crate::commands::log_msg(&format!("Transient SFTP error on dst ({}). Reconnecting SFTP for session '{}'...", err_str, dst_session_id));
                    self.invalidate_sftp(&dst_session_id);
                    let new_dst = self.get_or_init_sftp(&dst_session_id).await.map_err(|e| format!("Failed to reinit SFTP on dst: {}", e))?;
                    match new_dst.create(&dst_path).await {
                        Ok(f) => f,
                        Err(e2) => {
                            let _ = src_file.shutdown().await;
                            let err_msg = format!("Failed to create destination remote file '{}': {}", dst_path, e2);
                            crate::commands::log_msg(&err_msg);
                            let _ = app.emit("sftp-progress", TransferProgress {
                                transfer_id: transfer_id.clone(),
                                session_id: src_session_id.clone(),
                                file_name: file_name.clone(),
                                remote_path: src_path.clone(),
                                local_path: Some(dst_path.clone()),
                                direction: "remote-to-remote".into(),
                                bytes_transferred: 0,
                                total_bytes,
                                percentage: 0.0,
                                speed_bps: 0.0,
                                status: "error".into(),
                                error_message: Some(err_msg.clone()),
                            });
                            self.active_transfers.lock().remove(&transfer_id);
                            return Err(err_msg);
                        }
                    }
                } else {
                    let _ = src_file.shutdown().await;
                    let err_msg = format!("Failed to create destination remote file '{}': {}", dst_path, e);
                    crate::commands::log_msg(&err_msg);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: src_session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: src_path.clone(),
                        local_path: Some(dst_path.clone()),
                        direction: "remote-to-remote".into(),
                        bytes_transferred: 0,
                        total_bytes,
                        percentage: 0.0,
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            }
        };

        if total_bytes == 0 {
            let _ = dst_file.shutdown().await;
            let _ = src_file.shutdown().await;
            self.active_transfers.lock().remove(&transfer_id);
            let _ = app.emit("sftp-progress", TransferProgress {
                transfer_id: transfer_id.clone(),
                session_id: src_session_id.clone(),
                file_name,
                remote_path: src_path,
                local_path: Some(dst_path),
                direction: "remote-to-remote".into(),
                bytes_transferred: 0,
                total_bytes: 0,
                percentage: 100.0,
                speed_bps: 0.0,
                status: "completed".into(),
                error_message: None,
            });
            return Ok(());
        }

        let mut buffer = vec![0u8; 64 * 1024]; // 64 KB in-memory buffer
        let mut transferred: u64 = 0;
        let start_time = Instant::now();
        let mut last_emit = Instant::now();

        loop {
            let is_cancelled = cancel_flag.load(Ordering::SeqCst)
                || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch
                || parent_cancel.as_ref().map_or(false, |p| p.load(Ordering::SeqCst));
            if is_cancelled {
                let _ = dst_file.shutdown().await;
                let _ = src_file.shutdown().await;
                let _ = dst_sftp.remove_file(&dst_path).await;

                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: src_session_id.clone(),
                    file_name: file_name.clone(),
                    remote_path: src_path.clone(),
                    local_path: Some(dst_path.clone()),
                    direction: "remote-to-remote".into(),
                    bytes_transferred: transferred,
                    total_bytes,
                    percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                    speed_bps: 0.0,
                    status: "cancelled".into(),
                    error_message: Some("Transfer cancelled by user".into()),
                });
                self.active_transfers.lock().remove(&transfer_id);
                return Err("Transfer cancelled by user".into());
            }

            let n = match tokio::time::timeout(std::time::Duration::from_secs(30), src_file.read(&mut buffer)).await {
                Ok(Ok(bytes_read)) => bytes_read,
                Ok(Err(e)) => {
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), dst_file.shutdown()).await;
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), src_file.shutdown()).await;
                    let err_msg = format!("Error reading source remote file: {}", e);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: src_session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: src_path.clone(),
                        local_path: Some(dst_path.clone()),
                        direction: "remote-to-remote".into(),
                        bytes_transferred: transferred,
                        total_bytes,
                        percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
                Err(_) => {
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), dst_file.shutdown()).await;
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), src_file.shutdown()).await;
                    let err_msg = format!("Timeout reading source remote file '{}' (>30s)", src_path);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: src_session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: src_path.clone(),
                        local_path: Some(dst_path.clone()),
                        direction: "remote-to-remote".into(),
                        bytes_transferred: transferred,
                        total_bytes,
                        percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            };

            if n == 0 {
                break;
            }

            let write_res = tokio::time::timeout(std::time::Duration::from_secs(30), dst_file.write_all(&buffer[..n])).await;
            match write_res {
                Ok(Ok(())) => {},
                Ok(Err(e)) => {
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), dst_file.shutdown()).await;
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), src_file.shutdown()).await;
                    let err_msg = format!("Error writing destination remote file: {}", e);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: src_session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: src_path.clone(),
                        local_path: Some(dst_path.clone()),
                        direction: "remote-to-remote".into(),
                        bytes_transferred: transferred,
                        total_bytes,
                        percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
                Err(_) => {
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), dst_file.shutdown()).await;
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), src_file.shutdown()).await;
                    let err_msg = format!("Timeout writing destination remote file '{}' (>30s)", dst_path);
                    let _ = app.emit("sftp-progress", TransferProgress {
                        transfer_id: transfer_id.clone(),
                        session_id: src_session_id.clone(),
                        file_name: file_name.clone(),
                        remote_path: src_path.clone(),
                        local_path: Some(dst_path.clone()),
                        direction: "remote-to-remote".into(),
                        bytes_transferred: transferred,
                        total_bytes,
                        percentage: if total_bytes > 0 { (transferred as f32 / total_bytes as f32) * 100.0 } else { 0.0 },
                        speed_bps: 0.0,
                        status: "error".into(),
                        error_message: Some(err_msg.clone()),
                    });
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            }

            transferred += n as u64;

            if last_emit.elapsed().as_millis() > 200 || transferred >= total_bytes {
                let elapsed_secs = start_time.elapsed().as_secs_f64();
                let speed_bps = if elapsed_secs > 0.0 { transferred as f64 / elapsed_secs } else { 0.0 };
                let percentage = if total_bytes > 0 { ((transferred as f32 / total_bytes as f32) * 100.0).min(100.0) } else { 100.0 };

                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: src_session_id.clone(),
                    file_name: file_name.clone(),
                    remote_path: src_path.clone(),
                    local_path: Some(dst_path.clone()),
                    direction: "remote-to-remote".into(),
                    bytes_transferred: transferred,
                    total_bytes,
                    percentage,
                    speed_bps,
                    status: if transferred >= total_bytes { "completed".into() } else { "transferring".into() },
                    error_message: None,
                });
                last_emit = Instant::now();
            }

            if total_bytes > 0 && transferred >= total_bytes {
                break;
            }
        }

        let _ = tokio::time::timeout(std::time::Duration::from_secs(10), dst_file.shutdown()).await;
        let _ = tokio::time::timeout(std::time::Duration::from_secs(10), src_file.shutdown()).await;

        if set_web_permissions {
            let _ = tokio::time::timeout(std::time::Duration::from_secs(5), dst_sftp.set_metadata(&dst_path, russh_sftp::protocol::FileAttributes {
                permissions: Some(0o644),
                ..Default::default()
            })).await;
        }

        self.active_transfers.lock().remove(&transfer_id);

        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: src_session_id.clone(),
            file_name,
            remote_path: src_path,
            local_path: Some(dst_path),
            direction: "remote-to-remote".into(),
            bytes_transferred: transferred,
            total_bytes,
            percentage: 100.0,
            speed_bps: 0.0,
            status: "completed".into(),
            error_message: None,
        });

        Ok(())
    }

    /// Recursively transfer a whole folder directly between two remote servers via RAM pipe (pipelined)
    pub async fn transfer_remote_to_remote_folder_recursive(
        &self,
        app: AppHandle,
        src_session_id: String,
        dst_session_id: String,
        transfer_id: String,
        src_folder: String,
        dst_parent_folder: String,
        concurrency: Option<usize>,
    ) -> Result<(), String> {
        let start_epoch = self.cancel_epoch.load(Ordering::SeqCst);
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let folder_notify = Arc::new(tokio::sync::Notify::new());
        self.active_transfers
            .lock()
            .insert(transfer_id.clone(), cancel_flag.clone());
        self.folder_notifiers
            .lock()
            .insert(transfer_id.clone(), folder_notify.clone());

        let src_sftp = self.get_or_init_sftp(&src_session_id).await?;
        let dst_sftp = self.get_or_init_sftp(&dst_session_id).await?;

        let folder_name = src_folder
            .trim_end_matches('/')
            .split('/')
            .last()
            .unwrap_or("folder");

        let dst_root = if dst_parent_folder == "." || dst_parent_folder.is_empty() {
            folder_name.to_string()
        } else if dst_parent_folder.trim_end_matches('/').ends_with(folder_name) {
            dst_parent_folder.clone()
        } else {
            format!("{}/{}", dst_parent_folder.trim_end_matches('/'), folder_name)
        };

        // Create root dir on target remote
        self.ensure_dir_exists(&dst_session_id, &dst_sftp, &dst_root).await?;

        let known_dirs = Arc::new(std::sync::Mutex::new(std::collections::HashSet::<String>::new()));
        {
            known_dirs.lock().unwrap().insert(dst_root.clone());
        }

        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: src_session_id.clone(),
            file_name: format!("📁 {}", folder_name),
            remote_path: src_folder.clone(),
            local_path: Some(dst_parent_folder.clone()),
            direction: "remote-to-remote".into(),
            bytes_transferred: 0,
            total_bytes: 0,
            percentage: 0.0,
            speed_bps: 0.0,
            status: "transferring".into(),
            error_message: None,
        });

        let conc = concurrency.unwrap_or_else(|| self.get_concurrency()).clamp(1, 20);
        let (sem_id, semaphore) = self.register_semaphore(conc);
        let (tx, mut rx) = tokio::sync::mpsc::channel::<(String, String, String, u64)>(500);

        let scanner_app = app.clone();
        let scanner_src_id = src_session_id.clone();
        let scanner_dst_id = dst_session_id.clone();
        let scanner_this = self.clone();
        let scanner_src_sftp = src_sftp.clone();
        let scanner_dst_sftp = dst_sftp.clone();
        let scanner_src_folder = src_folder.clone();
        let scanner_dst_root = dst_root.clone();
        let scanner_known_dirs = known_dirs.clone();

        // 5 Parallel directory scan workers to smoothly feed the queue
        let scan_semaphore = Arc::new(tokio::sync::Semaphore::new(5));
        let (dir_tx, mut dir_rx) = tokio::sync::mpsc::channel::<String>(10000);
        let active_dirs = Arc::new(AtomicUsize::new(1));
        let file_idx = Arc::new(AtomicUsize::new(0));
        let done_notify = Arc::new(tokio::sync::Notify::new());
        let cancel_flag_scan = cancel_flag.clone();
        let folder_notify_scan = folder_notify.clone();
        let global_notify_scan = self.cancel_notify.clone();
        let epoch_scan = self.cancel_epoch.clone();

        let _ = dir_tx.send(scanner_src_folder.clone()).await;

        let scan_handle = tokio::spawn(async move {
            let mut scan_join_set = tokio::task::JoinSet::new();

            loop {
                if cancel_flag_scan.load(Ordering::SeqCst) || epoch_scan.load(Ordering::SeqCst) != start_epoch {
                    scan_join_set.abort_all();
                    break;
                }
                tokio::select! {
                    _ = folder_notify_scan.notified() => {
                        scan_join_set.abort_all();
                        break;
                    }
                    _ = global_notify_scan.notified() => {
                        scan_join_set.abort_all();
                        break;
                    }
                    _ = done_notify.notified() => {
                        break;
                    }
                    dir_opt = dir_rx.recv() => {
                        if cancel_flag_scan.load(Ordering::SeqCst) || epoch_scan.load(Ordering::SeqCst) != start_epoch {
                            scan_join_set.abort_all();
                            break;
                        }
                        match dir_opt {
                            Some(current_dir) => {
                                let permit = match scan_semaphore.clone().acquire_owned().await {
                                    Ok(p) => p,
                                    Err(_) => break,
                                };

                                let sftp_c = scanner_src_sftp.clone();
                                let dst_sftp_c = scanner_dst_sftp.clone();
                                let src_folder_c = scanner_src_folder.clone();
                                let dst_root_c = scanner_dst_root.clone();
                                let this_c = scanner_this.clone();
                                let app_c = scanner_app.clone();
                                let src_id_c = scanner_src_id.clone();
                                let dst_id_c = scanner_dst_id.clone();
                                let known_dirs_c = scanner_known_dirs.clone();
                                let dir_tx_c = dir_tx.clone();
                                let tx_c = tx.clone();
                                let active_dirs_c = active_dirs.clone();
                                let file_idx_c = file_idx.clone();
                                let done_notify_c = done_notify.clone();
                                let cancel_task = cancel_flag_scan.clone();
                                let epoch_task = epoch_scan.clone();

                                scan_join_set.spawn(async move {
                                    let _permit = permit;
                                    if cancel_task.load(Ordering::SeqCst) || epoch_task.load(Ordering::SeqCst) != start_epoch {
                                        if active_dirs_c.fetch_sub(1, Ordering::SeqCst) == 1 {
                                            done_notify_c.notify_one();
                                        }
                                        return;
                                    }
                                    let list = match tokio::time::timeout(std::time::Duration::from_secs(30), sftp_c.read_dir(&current_dir)).await {
                                        Ok(Ok(l)) => l,
                                        _ => {
                                            if active_dirs_c.fetch_sub(1, Ordering::SeqCst) == 1 {
                                                done_notify_c.notify_one();
                                            }
                                            return;
                                        }
                                    };

                                    for entry in list {
                                        if cancel_task.load(Ordering::SeqCst) || epoch_task.load(Ordering::SeqCst) != start_epoch {
                                            break;
                                        }
                                        let name = entry.file_name();
                                        if name == "." || name == ".." {
                                            continue;
                                        }
                                        let full_src = format!("{}/{}", current_dir.trim_end_matches('/'), name);
                                        let rel = full_src
                                            .strip_prefix(&src_folder_c)
                                            .unwrap_or(&full_src)
                                            .trim_start_matches('/');
                                        let full_dst = format!("{}/{}", dst_root_c, rel);

                                        if entry.file_type().is_dir() {
                                            let is_new = {
                                                let mut kd = known_dirs_c.lock().unwrap();
                                                kd.insert(full_dst.clone())
                                            };
                                            if is_new {
                                                let _ = tokio::time::timeout(std::time::Duration::from_secs(15), this_c.ensure_dir_exists(&dst_id_c, &dst_sftp_c, &full_dst)).await;
                                            }
                                            active_dirs_c.fetch_add(1, Ordering::SeqCst);
                                            let _ = dir_tx_c.send(full_src).await;
                                        } else {
                                            let size = entry.metadata().size.unwrap_or(0);
                                            let idx = file_idx_c.fetch_add(1, Ordering::Relaxed);
                                            let transfer_id = format!("tx_{}_{}_{}", chrono::Utc::now().timestamp_millis(), idx, name.replace('/', "_"));

                                            let _ = app_c.emit("sftp-progress", TransferProgress {
                                                transfer_id: transfer_id.clone(),
                                                session_id: src_id_c.clone(),
                                                file_name: rel.to_string(),
                                                remote_path: full_src.clone(),
                                                local_path: Some(full_dst.clone()),
                                                direction: "remote-to-remote".into(),
                                                bytes_transferred: 0,
                                                total_bytes: size,
                                                percentage: 0.0,
                                                speed_bps: 0.0,
                                                status: "pending".into(),
                                                error_message: None,
                                            });

                                            if tx_c.send((full_src, full_dst, transfer_id, size)).await.is_err() {
                                                if active_dirs_c.fetch_sub(1, Ordering::SeqCst) == 1 {
                                                    done_notify_c.notify_one();
                                                }
                                                return;
                                            }
                                        }
                                    }

                                    if active_dirs_c.fetch_sub(1, Ordering::SeqCst) == 1 {
                                        done_notify_c.notify_one();
                                    }
                                });
                            }
                            None => break,
                        }
                    }
                }
            }

            while let Some(_) = scan_join_set.join_next().await {}
        });

        let mut join_set = tokio::task::JoinSet::new();
        let global_notify = self.cancel_notify.clone();

        loop {
            if cancel_flag.load(Ordering::SeqCst) || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch {
                scan_handle.abort();
                join_set.abort_all();
                self.unregister_semaphore(sem_id);
                self.active_transfers.lock().remove(&transfer_id);
                self.folder_notifiers.lock().remove(&transfer_id);
                return Err("Transfer cancelled by user".into());
            }

            tokio::select! {
                _ = folder_notify.notified() => {
                    scan_handle.abort();
                    join_set.abort_all();
                    self.unregister_semaphore(sem_id);
                    self.active_transfers.lock().remove(&transfer_id);
                    self.folder_notifiers.lock().remove(&transfer_id);
                    return Err("Transfer cancelled by user".into());
                }
                _ = global_notify.notified() => {
                    scan_handle.abort();
                    join_set.abort_all();
                    self.unregister_semaphore(sem_id);
                    self.active_transfers.lock().remove(&transfer_id);
                    self.folder_notifiers.lock().remove(&transfer_id);
                    return Err("Transfer cancelled by user".into());
                }
                recv_res = rx.recv() => {
                    match recv_res {
                        Some((src_file_path, dst_file_path, file_transfer_id, size)) => {
                            if cancel_flag.load(Ordering::SeqCst) || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch {
                                scan_handle.abort();
                                join_set.abort_all();
                                self.unregister_semaphore(sem_id);
                                self.active_transfers.lock().remove(&transfer_id);
                                self.folder_notifiers.lock().remove(&transfer_id);
                                return Err("Transfer cancelled by user".into());
                            }

                            let permit = tokio::select! {
                                _ = folder_notify.notified() => {
                                    scan_handle.abort();
                                    join_set.abort_all();
                                    self.unregister_semaphore(sem_id);
                                    self.active_transfers.lock().remove(&transfer_id);
                                    self.folder_notifiers.lock().remove(&transfer_id);
                                    return Err("Transfer cancelled by user".into());
                                }
                                _ = global_notify.notified() => {
                                    scan_handle.abort();
                                    join_set.abort_all();
                                    self.unregister_semaphore(sem_id);
                                    self.active_transfers.lock().remove(&transfer_id);
                                    self.folder_notifiers.lock().remove(&transfer_id);
                                    return Err("Transfer cancelled by user".into());
                                }
                                p = semaphore.clone().acquire_owned() => {
                                    match p {
                                        Ok(perm) => perm,
                                        Err(_) => break,
                                    }
                                }
                            };

                            let this = self.clone();
                            let app_c = app.clone();
                            let src_id_c = src_session_id.clone();
                            let dst_id_c = dst_session_id.clone();
                            let src_sftp_c = src_sftp.clone();
                            let dst_sftp_c = dst_sftp.clone();
                            let known_dirs_c = known_dirs.clone();
                            let cancel_c = cancel_flag.clone();
                            let epoch_c = start_epoch;

                            join_set.spawn(async move {
                                let _permit = permit;
                                if cancel_c.load(Ordering::SeqCst) || this.cancel_epoch.load(Ordering::SeqCst) != epoch_c {
                                    return;
                                }
                                let _ = this.transfer_remote_to_remote_file_fast(
                                    app_c,
                                    src_id_c,
                                    dst_id_c,
                                    Some(src_sftp_c),
                                    Some(dst_sftp_c),
                                    file_transfer_id,
                                    src_file_path,
                                    dst_file_path,
                                    size,
                                    Some(known_dirs_c),
                                    false, // batch: fix_web_permissions is called once at the end
                                    Some(cancel_c),
                                ).await;
                            });
                        }
                        None => break,
                    }
                }
            }
        }

        let _ = scan_handle.await;
        while let Some(_) = join_set.join_next().await {}
        self.unregister_semaphore(sem_id);
        self.active_transfers.lock().remove(&transfer_id);
        self.folder_notifiers.lock().remove(&transfer_id);

        if cancel_flag.load(Ordering::SeqCst) || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch {
            return Err("Transfer cancelled by user".into());
        }

        // Fix web permissions (755 for dirs, 644 for files)
        let _ = self.fix_web_permissions(&dst_session_id, &dst_root).await;

        Ok(())
    }

    /// Upload a whole local folder recursively to remote server (pipelined)
    pub async fn upload_folder_recursive(
        &self,
        app: AppHandle,
        session_id: String,
        transfer_id: String,
        local_folder: String,
        remote_folder: String,
        concurrency: Option<usize>,
    ) -> Result<(), String> {
        let start_epoch = self.cancel_epoch.load(Ordering::SeqCst);
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let folder_notify = Arc::new(tokio::sync::Notify::new());
        self.active_transfers
            .lock()
            .insert(transfer_id.clone(), cancel_flag.clone());
        self.folder_notifiers
            .lock()
            .insert(transfer_id.clone(), folder_notify.clone());

        let sftp = self.get_or_init_sftp(&session_id).await?;
        let base_local = std::path::PathBuf::from(&local_folder);

        if !base_local.is_dir() {
            self.active_transfers.lock().remove(&transfer_id);
            return Err(format!("Local path '{}' is not a folder", local_folder));
        }

        let folder_name = base_local
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "folder".to_string());

        let target_remote_root = if remote_folder == "." || remote_folder.is_empty() {
            folder_name.clone()
        } else {
            format!("{}/{}", remote_folder.trim_end_matches('/'), folder_name)
        };

        // Create remote root folder
        if let Err(e) = self.ensure_dir_exists(&session_id, &sftp, &target_remote_root).await {
            self.active_transfers.lock().remove(&transfer_id);
            return Err(e);
        }

        let known_dirs = Arc::new(std::sync::Mutex::new(std::collections::HashSet::<String>::new()));
        {
            known_dirs.lock().unwrap().insert(target_remote_root.clone());
        }

        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            file_name: format!("📁 {}", folder_name),
            remote_path: target_remote_root.clone(),
            local_path: Some(local_folder.clone()),
            direction: "upload".into(),
            bytes_transferred: 0,
            total_bytes: 0,
            percentage: 0.0,
            speed_bps: 0.0,
            status: "transferring".into(),
            error_message: None,
        });

        let conc = concurrency.unwrap_or_else(|| self.get_concurrency()).clamp(1, 20);
        let (sem_id, semaphore) = self.register_semaphore(conc);
        let (tx, mut rx) = tokio::sync::mpsc::channel::<(std::path::PathBuf, String, String)>(500);

        let scanner_app = app.clone();
        let scanner_session_id = session_id.clone();
        let scanner_sftp = sftp.clone();
        let scanner_this = self.clone();
        let scanner_base_local = base_local.clone();
        let scanner_target_remote_root = target_remote_root.clone();
        let scanner_known_dirs = known_dirs.clone();
        let cancel_flag_scan = cancel_flag.clone();
        let folder_notify_scan = folder_notify.clone();
        let global_notify_scan = self.cancel_notify.clone();
        let epoch_scan = self.cancel_epoch.clone();

        // Parallel directory scanner (5 workers) to traverse folders concurrently
        let scan_semaphore = Arc::new(tokio::sync::Semaphore::new(5));
        let (dir_tx, mut dir_rx) = tokio::sync::mpsc::channel::<std::path::PathBuf>(10000);
        let active_dirs = Arc::new(AtomicUsize::new(1));
        let file_idx = Arc::new(AtomicUsize::new(0));
        let done_notify = Arc::new(tokio::sync::Notify::new());

        let _ = dir_tx.send(scanner_base_local.clone()).await;

        let scan_handle = tokio::spawn(async move {
            let mut scan_join_set = tokio::task::JoinSet::new();

            loop {
                if cancel_flag_scan.load(Ordering::SeqCst) || epoch_scan.load(Ordering::SeqCst) != start_epoch {
                    scan_join_set.abort_all();
                    break;
                }

                tokio::select! {
                    _ = folder_notify_scan.notified() => {
                        scan_join_set.abort_all();
                        break;
                    }
                    _ = global_notify_scan.notified() => {
                        scan_join_set.abort_all();
                        break;
                    }
                    _ = done_notify.notified() => {
                        break;
                    }
                    dir_opt = dir_rx.recv() => {
                        match dir_opt {
                            Some(current_dir) => {
                                if cancel_flag_scan.load(Ordering::SeqCst) || epoch_scan.load(Ordering::SeqCst) != start_epoch {
                                    scan_join_set.abort_all();
                                    break;
                                }

                                let permit = match scan_semaphore.clone().acquire_owned().await {
                                    Ok(p) => p,
                                    Err(_) => break,
                                };

                                let base_local_c = scanner_base_local.clone();
                                let target_root_c = scanner_target_remote_root.clone();
                                let this_c = scanner_this.clone();
                                let app_c = scanner_app.clone();
                                let sess_c = scanner_session_id.clone();
                                let sftp_c = scanner_sftp.clone();
                                let known_dirs_c = scanner_known_dirs.clone();
                                let dir_tx_c = dir_tx.clone();
                                let tx_c = tx.clone();
                                let active_dirs_c = active_dirs.clone();
                                let file_idx_c = file_idx.clone();
                                let done_notify_c = done_notify.clone();
                                let cancel_task = cancel_flag_scan.clone();
                                let epoch_task = epoch_scan.clone();

                                scan_join_set.spawn(async move {
                                    let _permit = permit;
                                    if cancel_task.load(Ordering::SeqCst) || epoch_task.load(Ordering::SeqCst) != start_epoch {
                                        if active_dirs_c.fetch_sub(1, Ordering::SeqCst) == 1 {
                                            done_notify_c.notify_one();
                                        }
                                        return;
                                    }

                                    let entries = match std::fs::read_dir(&current_dir) {
                                        Ok(e) => e,
                                        Err(_) => {
                                            if active_dirs_c.fetch_sub(1, Ordering::SeqCst) == 1 {
                                                done_notify_c.notify_one();
                                            }
                                            return;
                                        }
                                    };

                                    for entry in entries.flatten() {
                                        if cancel_task.load(Ordering::SeqCst) || epoch_task.load(Ordering::SeqCst) != start_epoch {
                                            break;
                                        }
                                        let path = entry.path();
                                        let is_dir = path.is_dir();
                                        let rel = match path.strip_prefix(&base_local_c) {
                                            Ok(r) => r.to_string_lossy().replace('\\', "/"),
                                            Err(_) => continue,
                                        };
                                        let remote_path = format!("{}/{}", target_root_c, rel);

                                        if is_dir {
                                            let is_new = {
                                                let mut kd = known_dirs_c.lock().unwrap();
                                                kd.insert(remote_path.clone())
                                            };
                                            if is_new {
                                                let _ = this_c.ensure_dir_exists(&sess_c, &sftp_c, &remote_path).await;
                                            }
                                            active_dirs_c.fetch_add(1, Ordering::SeqCst);
                                            let _ = dir_tx_c.send(path).await;
                                        } else {
                                            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                                            let idx = file_idx_c.fetch_add(1, Ordering::Relaxed);
                                            let file_transfer_id = format!("tx_{}_{}_{}", chrono::Utc::now().timestamp_millis(), idx, rel.replace('/', "_"));

                                            let _ = app_c.emit("sftp-progress", TransferProgress {
                                                transfer_id: file_transfer_id.clone(),
                                                session_id: sess_c.clone(),
                                                file_name: rel.clone(),
                                                remote_path: remote_path.clone(),
                                                local_path: Some(path.to_string_lossy().to_string()),
                                                direction: "upload".into(),
                                                bytes_transferred: 0,
                                                total_bytes: size,
                                                percentage: 0.0,
                                                speed_bps: 0.0,
                                                status: "pending".into(),
                                                error_message: None,
                                            });

                                            if tx_c.send((path, remote_path, file_transfer_id)).await.is_err() {
                                                return;
                                            }
                                        }
                                    }

                                    if active_dirs_c.fetch_sub(1, Ordering::SeqCst) == 1 {
                                        done_notify_c.notify_one();
                                    }
                                });
                            }
                            None => break,
                        }
                    }
                }
            }

            while let Some(_) = scan_join_set.join_next().await {}
        });

        let mut join_set = tokio::task::JoinSet::new();
        let global_notify = self.cancel_notify.clone();

        loop {
            if cancel_flag.load(Ordering::SeqCst) || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch {
                scan_handle.abort();
                join_set.abort_all();
                self.unregister_semaphore(sem_id);
                self.active_transfers.lock().remove(&transfer_id);
                self.folder_notifiers.lock().remove(&transfer_id);
                return Err("Transfer cancelled by user".into());
            }

            tokio::select! {
                _ = folder_notify.notified() => {
                    scan_handle.abort();
                    join_set.abort_all();
                    self.unregister_semaphore(sem_id);
                    self.active_transfers.lock().remove(&transfer_id);
                    self.folder_notifiers.lock().remove(&transfer_id);
                    return Err("Transfer cancelled by user".into());
                }
                _ = global_notify.notified() => {
                    scan_handle.abort();
                    join_set.abort_all();
                    self.unregister_semaphore(sem_id);
                    self.active_transfers.lock().remove(&transfer_id);
                    self.folder_notifiers.lock().remove(&transfer_id);
                    return Err("Transfer cancelled by user".into());
                }
                recv_res = rx.recv() => {
                    match recv_res {
                        Some((local_file_path, remote_file_path, file_transfer_id)) => {
                            if cancel_flag.load(Ordering::SeqCst) || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch {
                                scan_handle.abort();
                                join_set.abort_all();
                                self.unregister_semaphore(sem_id);
                                self.active_transfers.lock().remove(&transfer_id);
                                self.folder_notifiers.lock().remove(&transfer_id);
                                return Err("Transfer cancelled by user".into());
                            }

                            let permit = tokio::select! {
                                _ = folder_notify.notified() => {
                                    scan_handle.abort();
                                    join_set.abort_all();
                                    self.unregister_semaphore(sem_id);
                                    self.active_transfers.lock().remove(&transfer_id);
                                    self.folder_notifiers.lock().remove(&transfer_id);
                                    return Err("Transfer cancelled by user".into());
                                }
                                _ = global_notify.notified() => {
                                    scan_handle.abort();
                                    join_set.abort_all();
                                    self.unregister_semaphore(sem_id);
                                    self.active_transfers.lock().remove(&transfer_id);
                                    self.folder_notifiers.lock().remove(&transfer_id);
                                    return Err("Transfer cancelled by user".into());
                                }
                                p = semaphore.clone().acquire_owned() => {
                                    match p {
                                        Ok(perm) => perm,
                                        Err(_) => break,
                                    }
                                }
                            };

                            let this = self.clone();
                            let app_c = app.clone();
                            let sess_c = session_id.clone();
                            let sftp_c = sftp.clone();
                            let known_dirs_c = known_dirs.clone();
                            let cancel_c = cancel_flag.clone();
                            let epoch_c = start_epoch;

                            join_set.spawn(async move {
                                let _permit = permit;
                                if cancel_c.load(Ordering::SeqCst) || this.cancel_epoch.load(Ordering::SeqCst) != epoch_c {
                                    return;
                                }
                                let _ = this.upload_file_stream_fast(
                                    app_c,
                                    sess_c,
                                    Some(sftp_c),
                                    file_transfer_id,
                                    local_file_path.to_string_lossy().to_string(),
                                    remote_file_path,
                                    None,
                                    Some(known_dirs_c),
                                    false, // batch: fix_web_permissions is called once at the end
                                    Some(cancel_c),
                                ).await;
                            });
                        }
                        None => break,
                    }
                }
            }
        }

        let _ = scan_handle.await;
        while let Some(_) = join_set.join_next().await {}
        self.unregister_semaphore(sem_id);
        self.active_transfers.lock().remove(&transfer_id);
        self.folder_notifiers.lock().remove(&transfer_id);

        if cancel_flag.load(Ordering::SeqCst) || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch {
            return Err("Transfer cancelled by user".into());
        }

        // Fix web permissions (755 for dirs, 644 for files)
        let _ = self.fix_web_permissions(&session_id, &target_remote_root).await;

        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            file_name: folder_name,
            remote_path: target_remote_root,
            local_path: Some(local_folder),
            direction: "upload".into(),
            bytes_transferred: 0,
            total_bytes: 0,
            percentage: 100.0,
            speed_bps: 0.0,
            status: "completed".into(),
            error_message: None,
        });

        Ok(())
    }

    /// Download a whole remote folder recursively to local machine (pipelined)
    pub async fn download_folder_recursive(
        &self,
        app: AppHandle,
        session_id: String,
        transfer_id: String,
        remote_folder: String,
        local_parent_dir: String,
        concurrency: Option<usize>,
    ) -> Result<(), String> {
        let start_epoch = self.cancel_epoch.load(Ordering::SeqCst);
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let folder_notify = Arc::new(tokio::sync::Notify::new());
        self.active_transfers
            .lock()
            .insert(transfer_id.clone(), cancel_flag.clone());
        self.folder_notifiers
            .lock()
            .insert(transfer_id.clone(), folder_notify.clone());

        let sftp = self.get_or_init_sftp(&session_id).await?;
        let conc = concurrency.unwrap_or_else(|| self.get_concurrency()).clamp(1, 20);
        let (sem_id, semaphore) = self.register_semaphore(conc);

        let folder_name = remote_folder
            .trim_end_matches('/')
            .split('/')
            .last()
            .unwrap_or("folder")
            .to_string();

        let local_root = std::path::PathBuf::from(&local_parent_dir).join(&folder_name);
        if let Err(e) = tokio::fs::create_dir_all(&local_root).await {
            self.unregister_semaphore(sem_id);
            self.active_transfers.lock().remove(&transfer_id);
            return Err(format!("Failed to create local directory: {}", e));
        }

        let local_dirs = Arc::new(std::sync::Mutex::new(std::collections::HashSet::<std::path::PathBuf>::new()));
        {
            local_dirs.lock().unwrap().insert(local_root.clone());
        }

        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            file_name: format!("📁 {}", folder_name),
            remote_path: remote_folder.clone(),
            local_path: Some(local_parent_dir.clone()),
            direction: "download".into(),
            bytes_transferred: 0,
            total_bytes: 0,
            percentage: 0.0,
            speed_bps: 0.0,
            status: "transferring".into(),
            error_message: None,
        });

        let (tx, mut rx) = tokio::sync::mpsc::channel::<(String, String, String)>(500);

        let scanner_app = app.clone();
        let scanner_session_id = session_id.clone();
        let scanner_sftp = sftp.clone();
        let scanner_remote_folder = remote_folder.clone();
        let scanner_local_root = local_root.clone();
        let scanner_local_dirs = local_dirs.clone();
        let cancel_flag_scan = cancel_flag.clone();
        let folder_notify_scan = folder_notify.clone();
        let global_notify_scan = self.cancel_notify.clone();
        let epoch_scan = self.cancel_epoch.clone();

        // Parallel remote directory scanner (5 workers)
        let scan_semaphore = Arc::new(tokio::sync::Semaphore::new(5));
        let (dir_tx, mut dir_rx) = tokio::sync::mpsc::channel::<String>(10000);
        let active_dirs = Arc::new(AtomicUsize::new(1));
        let file_idx = Arc::new(AtomicUsize::new(0));
        let done_notify = Arc::new(tokio::sync::Notify::new());

        let _ = dir_tx.send(scanner_remote_folder.clone()).await;

        let scan_handle = tokio::spawn(async move {
            let mut scan_join_set = tokio::task::JoinSet::new();

            loop {
                if cancel_flag_scan.load(Ordering::SeqCst) || epoch_scan.load(Ordering::SeqCst) != start_epoch {
                    scan_join_set.abort_all();
                    break;
                }

                tokio::select! {
                    _ = folder_notify_scan.notified() => {
                        scan_join_set.abort_all();
                        break;
                    }
                    _ = global_notify_scan.notified() => {
                        scan_join_set.abort_all();
                        break;
                    }
                    _ = done_notify.notified() => {
                        break;
                    }
                    dir_opt = dir_rx.recv() => {
                        match dir_opt {
                            Some(current_remote_dir) => {
                                if cancel_flag_scan.load(Ordering::SeqCst) || epoch_scan.load(Ordering::SeqCst) != start_epoch {
                                    scan_join_set.abort_all();
                                    break;
                                }

                                let permit = match scan_semaphore.clone().acquire_owned().await {
                                    Ok(p) => p,
                                    Err(_) => break,
                                };

                                let sftp_c = scanner_sftp.clone();
                                let remote_folder_c = scanner_remote_folder.clone();
                                let local_root_c = scanner_local_root.clone();
                                let local_dirs_c = scanner_local_dirs.clone();
                                let app_c = scanner_app.clone();
                                let sess_c = scanner_session_id.clone();
                                let dir_tx_c = dir_tx.clone();
                                let tx_c = tx.clone();
                                let active_dirs_c = active_dirs.clone();
                                let file_idx_c = file_idx.clone();
                                let done_notify_c = done_notify.clone();
                                let cancel_task = cancel_flag_scan.clone();
                                let epoch_task = epoch_scan.clone();

                                scan_join_set.spawn(async move {
                                    let _permit = permit;
                                    if cancel_task.load(Ordering::SeqCst) || epoch_task.load(Ordering::SeqCst) != start_epoch {
                                        if active_dirs_c.fetch_sub(1, Ordering::SeqCst) == 1 {
                                            done_notify_c.notify_one();
                                        }
                                        return;
                                    }

                                    let list = match tokio::time::timeout(std::time::Duration::from_secs(30), sftp_c.read_dir(&current_remote_dir)).await {
                                        Ok(Ok(l)) => l,
                                        _ => {
                                            if active_dirs_c.fetch_sub(1, Ordering::SeqCst) == 1 {
                                                done_notify_c.notify_one();
                                            }
                                            return;
                                        }
                                    };

                                    for entry in list {
                                        if cancel_task.load(Ordering::SeqCst) || epoch_task.load(Ordering::SeqCst) != start_epoch {
                                            break;
                                        }
                                        let name = entry.file_name();
                                        if name == "." || name == ".." {
                                            continue;
                                        }
                                        let full_remote = format!("{}/{}", current_remote_dir.trim_end_matches('/'), name);
                                        let rel = full_remote
                                            .strip_prefix(&remote_folder_c)
                                            .unwrap_or(&full_remote)
                                            .trim_start_matches('/');

                                        if entry.file_type().is_dir() {
                                            let local_sub = local_root_c.join(rel.replace('/', "\\"));
                                            let is_new = {
                                                let mut ld = local_dirs_c.lock().unwrap();
                                                ld.insert(local_sub.clone())
                                            };
                                            if is_new {
                                                let _ = tokio::fs::create_dir_all(&local_sub).await;
                                            }
                                            active_dirs_c.fetch_add(1, Ordering::SeqCst);
                                            let _ = dir_tx_c.send(full_remote).await;
                                        } else {
                                            let size = entry.metadata().size.unwrap_or(0);
                                            let local_dest = local_root_c.join(rel.replace('/', "\\"));
                                            let local_dest_str = local_dest.to_string_lossy().to_string();
                                            let idx = file_idx_c.fetch_add(1, Ordering::Relaxed);
                                            let file_transfer_id = format!("tx_{}_{}_{}", chrono::Utc::now().timestamp_millis(), idx, name.replace('/', "_"));

                                            let _ = app_c.emit("sftp-progress", TransferProgress {
                                                transfer_id: file_transfer_id.clone(),
                                                session_id: sess_c.clone(),
                                                file_name: rel.to_string(),
                                                remote_path: full_remote.clone(),
                                                local_path: Some(local_dest_str.clone()),
                                                direction: "download".into(),
                                                bytes_transferred: 0,
                                                total_bytes: size,
                                                percentage: 0.0,
                                                speed_bps: 0.0,
                                                status: "pending".into(),
                                                error_message: None,
                                            });

                                            if tx_c.send((full_remote, local_dest_str, file_transfer_id)).await.is_err() {
                                                return;
                                            }
                                        }
                                    }

                                    if active_dirs_c.fetch_sub(1, Ordering::SeqCst) == 1 {
                                        done_notify_c.notify_one();
                                    }
                                });
                            }
                            None => break,
                        }
                    }
                }
            }

            while let Some(_) = scan_join_set.join_next().await {}
        });

        let mut join_set = tokio::task::JoinSet::new();
        let global_notify = self.cancel_notify.clone();

        loop {
            if cancel_flag.load(Ordering::SeqCst) || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch {
                scan_handle.abort();
                join_set.abort_all();
                self.unregister_semaphore(sem_id);
                self.active_transfers.lock().remove(&transfer_id);
                self.folder_notifiers.lock().remove(&transfer_id);
                return Err("Transfer cancelled by user".into());
            }

            tokio::select! {
                _ = folder_notify.notified() => {
                    scan_handle.abort();
                    join_set.abort_all();
                    self.unregister_semaphore(sem_id);
                    self.active_transfers.lock().remove(&transfer_id);
                    self.folder_notifiers.lock().remove(&transfer_id);
                    return Err("Transfer cancelled by user".into());
                }
                _ = global_notify.notified() => {
                    scan_handle.abort();
                    join_set.abort_all();
                    self.unregister_semaphore(sem_id);
                    self.active_transfers.lock().remove(&transfer_id);
                    self.folder_notifiers.lock().remove(&transfer_id);
                    return Err("Transfer cancelled by user".into());
                }
                recv_res = rx.recv() => {
                    match recv_res {
                        Some((remote_path, local_dest, file_transfer_id)) => {
                            if cancel_flag.load(Ordering::SeqCst) || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch {
                                scan_handle.abort();
                                join_set.abort_all();
                                self.unregister_semaphore(sem_id);
                                self.active_transfers.lock().remove(&transfer_id);
                                self.folder_notifiers.lock().remove(&transfer_id);
                                return Err("Transfer cancelled by user".into());
                            }

                            let permit = tokio::select! {
                                _ = folder_notify.notified() => {
                                    scan_handle.abort();
                                    join_set.abort_all();
                                    self.unregister_semaphore(sem_id);
                                    self.active_transfers.lock().remove(&transfer_id);
                                    self.folder_notifiers.lock().remove(&transfer_id);
                                    return Err("Transfer cancelled by user".into());
                                }
                                _ = global_notify.notified() => {
                                    scan_handle.abort();
                                    join_set.abort_all();
                                    self.unregister_semaphore(sem_id);
                                    self.active_transfers.lock().remove(&transfer_id);
                                    self.folder_notifiers.lock().remove(&transfer_id);
                                    return Err("Transfer cancelled by user".into());
                                }
                                p = semaphore.clone().acquire_owned() => {
                                    match p {
                                        Ok(perm) => perm,
                                        Err(_) => break,
                                    }
                                }
                            };

                            let this = self.clone();
                            let app_c = app.clone();
                            let sess_c = session_id.clone();
                            let cancel_c = cancel_flag.clone();
                            let epoch_c = start_epoch;

                            join_set.spawn(async move {
                                let _permit = permit;
                                if cancel_c.load(Ordering::SeqCst) || this.cancel_epoch.load(Ordering::SeqCst) != epoch_c {
                                    return;
                                }
                                let _ = this.download_file_stream(
                                    app_c,
                                    sess_c,
                                    file_transfer_id,
                                    remote_path,
                                    local_dest,
                                    None,
                                    Some(cancel_c),
                                ).await;
                            });
                        }
                        None => break,
                    }
                }
            }
        }

        let _ = scan_handle.await;
        while let Some(_) = join_set.join_next().await {}
        self.unregister_semaphore(sem_id);
        self.active_transfers.lock().remove(&transfer_id);
        self.folder_notifiers.lock().remove(&transfer_id);

        if cancel_flag.load(Ordering::SeqCst) || self.cancel_epoch.load(Ordering::SeqCst) != start_epoch {
            return Err("Transfer cancelled by user".into());
        }

        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            file_name: folder_name,
            remote_path: remote_folder,
            local_path: Some(local_root.to_string_lossy().to_string()),
            direction: "download".into(),
            bytes_transferred: 0,
            total_bytes: 0,
            percentage: 100.0,
            speed_bps: 0.0,
            status: "completed".into(),
            error_message: None,
        });

        Ok(())
    }

    pub fn close(&self, session_id: &str) {
        self.sessions.lock().remove(session_id);
    }
}
