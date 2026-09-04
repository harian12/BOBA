use async_trait::async_trait;
use parking_lot::Mutex;
use russh::client::{self, Handler};
use russh::ChannelMsg;
use russh_keys::key::KeyPair;
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
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
    pub direction: String, // "upload" | "download"
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
    pub host: String,
}

pub struct SshManager {
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
    active_transfers: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            active_transfers: Arc::new(Mutex::new(HashMap::new())),
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
    ) -> Result<(), String> {
        let config = Arc::new(client::Config::default());
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
        } else if let Some(pass) = password {
            auth_ok = session
                .authenticate_password(username.clone(), pass)
                .await
                .map_err(|e| format!("Password auth error: {}", e))?;
        }

        if !auth_ok {
            return Err("Authentication failed: invalid credentials or key not accepted".into());
        }

        // Try early open SFTP channel
        let mut sftp_client_opt = None;
        if let Ok(sftp_channel) = session.channel_open_session().await {
            if sftp_channel.request_subsystem(true, "sftp").await.is_ok() {
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
            host: host.clone(),
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

    /// Execute a quick command in a dedicated session channel and collect output
    pub async fn exec_command(&self, session_id: &str, command: &str) -> Result<String, String> {
        let handle_opt = {
            let sessions = self.sessions.lock();
            sessions.get(session_id).map(|s| s.session_handle.clone())
        };

        if let Some(handle_arc) = handle_opt {
            let handle = handle_arc.lock().await;
            let mut channel = handle
                .channel_open_session()
                .await
                .map_err(|e| format!("Failed to open exec channel: {}", e))?;

            channel
                .exec(true, command)
                .await
                .map_err(|e| format!("Failed to exec command: {}", e))?;

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

            return String::from_utf8(output).map_err(|e| format!("Exec output not UTF-8: {}", e));
        }

        Err("Session not found".into())
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
        let (existing_sftp, handle_opt) = {
            let sessions = self.sessions.lock();
            match sessions.get(session_id) {
                Some(s) => (s.sftp.clone(), Some(s.session_handle.clone())),
                None => (None, None),
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

            sftp_channel
                .request_subsystem(true, "sftp")
                .await
                .map_err(|e| format!("Failed to request SFTP subsystem on server: {}", e))?;

            let sftp = SftpSession::new(sftp_channel.into_stream())
                .await
                .map_err(|e| format!("Failed to initialize SFTP client: {}", e))?;

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

            let is_dir = entry.file_type().is_dir();
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
        String::from_utf8(content).map_err(|e| format!("File is not valid UTF-8 text: {}", e))
    }

    pub async fn write_file(&self, session_id: &str, path: &str, content: &str) -> Result<(), String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        let mut file = sftp.create(path).await.map_err(|e| format!("Failed to create remote file: {}", e))?;
        file.write_all(content.as_bytes()).await.map_err(|e| format!("Failed to write file: {}", e))?;
        file.flush().await.map_err(|e| format!("Failed to flush file: {}", e))?;
        Ok(())
    }

    pub async fn download_binary(&self, session_id: &str, path: &str) -> Result<String, String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        let mut file = sftp.open(path).await.map_err(|e| format!("Failed to open remote file: {}", e))?;
        let mut content = Vec::new();
        file.read_to_end(&mut content).await.map_err(|e| format!("Failed to read file: {}", e))?;
        Ok(base64::engine::general_purpose::STANDARD.encode(&content))
    }

    pub async fn upload_binary(&self, session_id: &str, path: &str, base64_data: &str) -> Result<(), String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        let raw_bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| format!("Invalid base64 payload: {}", e))?;

        // Ensure parent directory exists before creating file
        if let Some(parent) = std::path::Path::new(path).parent() {
            let parent_str = parent.to_string_lossy().replace('\\', "/");
            if !parent_str.is_empty() && parent_str != "." {
                let _ = Self::mkdir_p_recursive(&sftp, &parent_str).await;
            }
        }

        let mut file = sftp.create(path).await.map_err(|e| format!("Failed to create remote file: {}", e))?;
        file.write_all(&raw_bytes).await.map_err(|e| format!("Failed to write binary data: {}", e))?;
        file.flush().await.map_err(|e| format!("Failed to flush file: {}", e))?;
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
        Self::mkdir_p_recursive(&sftp, path).await
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

            // Attempt to create directory, ignore error if already exists
            let _ = sftp.create_dir(&current).await;
        }

        Ok(())
    }

    pub async fn rename_path(&self, session_id: &str, old_path: &str, new_path: &str) -> Result<(), String> {
        let sftp = self.get_or_init_sftp(session_id).await?;
        sftp.rename(old_path, new_path).await.map_err(|e| format!("Failed to rename path: {}", e))?;
        Ok(())
    }

    /// Cancel an in-progress transfer by transfer_id
    pub fn cancel_transfer(&self, transfer_id: &str) {
        let mut map = self.active_transfers.lock();
        if let Some(flag) = map.remove(transfer_id) {
            flag.store(true, Ordering::SeqCst);
        }
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
    ) -> Result<(), String> {
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            self.active_transfers.lock().insert(transfer_id.clone(), cancel_flag.clone());
        }

        let sftp = self.get_or_init_sftp(&session_id).await?;
        let file_stat = sftp.metadata(&remote_path).await.map_err(|e| format!("Failed to stat remote file: {}", e))?;
        let total_bytes = file_stat.size.unwrap_or(0);
        let file_name = std::path::Path::new(&remote_path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| remote_path.clone());

        let mut remote_file = sftp.open(&remote_path).await.map_err(|e| format!("Failed to open remote file: {}", e))?;
        
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

        loop {
            if cancel_flag.load(Ordering::SeqCst) {
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
        }

        local_file.flush().await.map_err(|e| format!("Failed to flush local file: {}", e))?;
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
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            self.active_transfers.lock().insert(transfer_id.clone(), cancel_flag.clone());
        }

        let mut local_file = tokio::fs::File::open(&local_path)
            .await
            .map_err(|e| format!("Failed to open local file: {}", e))?;

        let meta = local_file.metadata().await.map_err(|e| format!("Failed to read local file metadata: {}", e))?;
        let total_bytes = meta.len();
        let file_name = std::path::Path::new(&local_path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| local_path.clone());

        let sftp = self.get_or_init_sftp(&session_id).await?;
        let initial_offset = resume_from.unwrap_or(0);

        let mut remote_file = if initial_offset > 0 {
            let mut rf = sftp
                .open_with_flags(
                    &remote_path,
                    russh_sftp::protocol::OpenFlags::WRITE | russh_sftp::protocol::OpenFlags::CREATE,
                )
                .await
                .map_err(|e| format!("Failed to open remote file for resume: {}", e))?;
            rf.seek(std::io::SeekFrom::Start(initial_offset))
                .await
                .map_err(|e| format!("Failed to seek remote file: {}", e))?;
            local_file
                .seek(std::io::SeekFrom::Start(initial_offset))
                .await
                .map_err(|e| format!("Failed to seek local file: {}", e))?;
            rf
        } else {
            sftp.create(&remote_path).await.map_err(|e| format!("Failed to create remote file: {}", e))?
        };

        let mut buffer = vec![0u8; 64 * 1024]; // 64 KB chunk
        let mut transferred: u64 = initial_offset;
        let start_time = Instant::now();
        let mut last_emit = Instant::now();

        loop {
            if cancel_flag.load(Ordering::SeqCst) {
                // Hapus file remote yang belum selesai ditransfer agar tidak menjadi file korup di server
                drop(remote_file);
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
        }

        remote_file.flush().await.map_err(|e| format!("Failed to flush remote file: {}", e))?;
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
    ) -> Result<(), String> {
        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.active_transfers
            .lock()
            .insert(transfer_id.clone(), cancel_flag.clone());

        let src_sftp = self.get_or_init_sftp(&src_session_id).await?;
        let dst_sftp = self.get_or_init_sftp(&dst_session_id).await?;

        let src_meta = src_sftp
            .metadata(&src_path)
            .await
            .map_err(|e| format!("Failed to get source remote metadata: {}", e))?;
        let total_bytes = src_meta.size.unwrap_or(0);

        let file_name = src_path
            .split('/')
            .last()
            .unwrap_or(&src_path)
            .to_string();

        let mut src_file = src_sftp
            .open(&src_path)
            .await
            .map_err(|e| format!("Failed to open source remote file: {}", e))?;
        let mut dst_file = dst_sftp
            .create(&dst_path)
            .await
            .map_err(|e| format!("Failed to create destination remote file: {}", e))?;

        let mut buffer = vec![0u8; 64 * 1024]; // 64 KB in-memory buffer
        let mut transferred: u64 = 0;
        let start_time = Instant::now();
        let mut last_emit = Instant::now();

        loop {
            if cancel_flag.load(Ordering::SeqCst) {
                drop(dst_file);
                let _ = dst_sftp.remove_file(&dst_path).await;

                let _ = app.emit("sftp-progress", TransferProgress {
                    transfer_id: transfer_id.clone(),
                    session_id: src_session_id.clone(),
                    file_name: file_name.clone(),
                    remote_path: dst_path.clone(),
                    local_path: Some(format!("Remote:{}", src_session_id)),
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

            let n = match src_file.read(&mut buffer).await {
                Ok(bytes_read) => bytes_read,
                Err(e) => {
                    let err_msg = format!("Error reading source remote file: {}", e);
                    self.active_transfers.lock().remove(&transfer_id);
                    return Err(err_msg);
                }
            };

            if n == 0 {
                break;
            }

            if let Err(e) = dst_file.write_all(&buffer[..n]).await {
                let err_msg = format!("Error writing destination remote file: {}", e);
                self.active_transfers.lock().remove(&transfer_id);
                return Err(err_msg);
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
                    remote_path: dst_path.clone(),
                    local_path: Some(format!("Remote:{}", src_session_id)),
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
        }

        dst_file.flush().await.map_err(|e| format!("Failed to flush destination file: {}", e))?;
        self.active_transfers.lock().remove(&transfer_id);

        let _ = app.emit("sftp-progress", TransferProgress {
            transfer_id: transfer_id.clone(),
            session_id: src_session_id.clone(),
            file_name,
            remote_path: dst_path,
            local_path: Some(format!("Remote:{}", src_session_id)),
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

    /// Upload a whole local folder recursively to remote server
    pub async fn upload_folder_recursive(
        &self,
        app: AppHandle,
        session_id: String,
        local_folder: String,
        remote_folder: String,
    ) -> Result<(), String> {
        let sftp = self.get_or_init_sftp(&session_id).await?;
        let base_local = std::path::PathBuf::from(&local_folder);

        if !base_local.is_dir() {
            return Err(format!("Local path '{}' is not a folder", local_folder));
        }

        let folder_name = base_local
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "folder".to_string());

        let target_remote_root = if remote_folder == "." || remote_folder.is_empty() {
            folder_name
        } else {
            format!("{}/{}", remote_folder.trim_end_matches('/'), folder_name)
        };

        // Create remote root folder
        Self::mkdir_p_recursive(&sftp, &target_remote_root).await?;

        // Recursively walk through local folder
        let mut items = Vec::new();
        fn walk(dir: &std::path::Path, base: &std::path::Path, out: &mut Vec<(std::path::PathBuf, String, bool)>) {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let is_dir = path.is_dir();
                    if let Ok(rel) = path.strip_prefix(base) {
                        out.push((path.clone(), rel.to_string_lossy().replace('\\', "/"), is_dir));
                    }
                    if is_dir {
                        walk(&path, base, out);
                    }
                }
            }
        }
        walk(&base_local, &base_local, &mut items);

        // First create all subdirectories
        for (_, rel, _) in items.iter().filter(|(_, _, is_dir)| *is_dir) {
            let remote_dir = format!("{}/{}", target_remote_root, rel);
            let _ = Self::mkdir_p_recursive(&sftp, &remote_dir).await;
        }

        // Then upload all files
        for (local_file_path, rel, _) in items.into_iter().filter(|(_, _, is_dir)| !*is_dir) {
            let remote_file_path = format!("{}/{}", target_remote_root, rel);
            let transfer_id = format!("tx_{}_{}", chrono::Utc::now().timestamp_millis(), &rel.replace('/', "_"));
            let _ = self
                .upload_file_stream(
                    app.clone(),
                    session_id.clone(),
                    transfer_id,
                    local_file_path.to_string_lossy().to_string(),
                    remote_file_path,
                    None,
                )
                .await;
        }

        Ok(())
    }

    /// Download a whole remote folder recursively to local machine
    pub async fn download_folder_recursive(
        &self,
        app: AppHandle,
        session_id: String,
        remote_folder: String,
        local_parent_dir: String,
    ) -> Result<(), String> {
        let sftp = self.get_or_init_sftp(&session_id).await?;

        let folder_name = remote_folder
            .trim_end_matches('/')
            .split('/')
            .last()
            .unwrap_or("folder");

        let local_root = std::path::PathBuf::from(&local_parent_dir).join(folder_name);
        tokio::fs::create_dir_all(&local_root)
            .await
            .map_err(|e| format!("Failed to create local directory: {}", e))?;

        // Recursively list remote directory
        let mut files_to_download: Vec<(String, String)> = Vec::new();
        let mut dirs_to_traverse: Vec<String> = vec![remote_folder.clone()];

        while let Some(current_remote_dir) = dirs_to_traverse.pop() {
            let list = sftp
                .read_dir(&current_remote_dir)
                .await
                .map_err(|e| format!("Failed to list remote folder '{}': {}", current_remote_dir, e))?;

            for entry in list {
                let name = entry.file_name();
                if name == "." || name == ".." {
                    continue;
                }
                let full_remote = format!("{}/{}", current_remote_dir.trim_end_matches('/'), name);
                if entry.file_type().is_dir() {
                    // Create local matching folder
                    let rel = full_remote
                        .strip_prefix(&remote_folder)
                        .unwrap_or(&full_remote)
                        .trim_start_matches('/');
                    let local_sub = local_root.join(rel.replace('/', "\\"));
                    let _ = tokio::fs::create_dir_all(&local_sub).await;
                    dirs_to_traverse.push(full_remote);
                } else {
                    files_to_download.push((full_remote, name));
                }
            }
        }

        // Stream download all files
        for (remote_path, _) in files_to_download {
            let rel = remote_path
                .strip_prefix(&remote_folder)
                .unwrap_or(&remote_path)
                .trim_start_matches('/');
            let local_dest = local_root.join(rel.replace('/', "\\"));
            let transfer_id = format!("tx_{}_{}", chrono::Utc::now().timestamp_millis(), rel.replace('/', "_"));

            let _ = self
                .download_file_stream(
                    app.clone(),
                    session_id.clone(),
                    transfer_id,
                    remote_path,
                    local_dest.to_string_lossy().to_string(),
                    None,
                )
                .await;
        }

        Ok(())
    }

    pub fn close(&self, session_id: &str) {
        self.sessions.lock().remove(session_id);
    }
}
