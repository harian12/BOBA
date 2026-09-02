use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshSessionConfig {
    pub id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String, // "password" | "key"
    pub password: Option<String>,
    pub key_id: Option<String>,
    pub sftp_auto_open: bool,
    pub terminal_theme: Option<String>,
    #[serde(default)]
    pub snippets: Option<Vec<SnippetItem>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshKeyItem {
    pub id: String,
    pub name: String,
    pub private_key: String,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnippetItem {
    pub id: String,
    pub title: String,
    pub command: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultData {
    pub vault_version: i64,
    pub updated_at: String,
    pub folders: Vec<Folder>,
    pub sessions: Vec<SshSessionConfig>,
    pub keys: Vec<SshKeyItem>,
    pub snippets: Vec<SnippetItem>,
}

impl Default for VaultData {
    fn default() -> Self {
        Self {
            vault_version: 0,
            updated_at: Utc::now().to_rfc3339(),
            folders: vec![
                Folder {
                    id: "default-servers".into(),
                    name: "My Servers".into(),
                    parent_id: None,
                }
            ],
            sessions: vec![],
            keys: vec![],
            snippets: vec![
                SnippetItem {
                    id: Uuid::new_v4().to_string(),
                    title: "System Status".into(),
                    command: "top -b -n 1 | head -n 20\n".into(),
                    description: Some("View quick CPU & RAM usage".into()),
                },
                SnippetItem {
                    id: Uuid::new_v4().to_string(),
                    title: "Disk Usage".into(),
                    command: "df -h\n".into(),
                    description: Some("Check storage disk partitions".into()),
                }
            ],
        }
    }
}
