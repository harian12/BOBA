use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#type: Option<String>,
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
    #[serde(default)]
    pub sftp_sudo: Option<bool>,
    #[serde(default)]
    pub sftp_sudo_command: Option<String>,
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
pub struct DbSavedQuery {
    pub id: String,
    pub title: String,
    pub query: String,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub db_connection_id: Option<String>,
    #[serde(default)]
    pub db_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default, alias = "createdAt", rename = "createdAt")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultData {
    pub vault_version: i64,
    pub updated_at: String,
    pub folders: Vec<Folder>,
    pub sessions: Vec<SshSessionConfig>,
    pub keys: Vec<SshKeyItem>,
    pub snippets: Vec<SnippetItem>,
    #[serde(default)]
    pub databases: Vec<crate::dbms::DbConnectionConfig>,
    #[serde(default)]
    pub db_snippets: Vec<DbSavedQuery>,
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
                    r#type: Some("session".into()),
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
            databases: vec![],
            db_snippets: vec![
                DbSavedQuery {
                    id: Uuid::new_v4().to_string(),
                    title: "Check Table Status".into(),
                    query: "SHOW TABLE STATUS;".into(),
                    engine: Some("mysql".into()),
                    db_connection_id: None,
                    db_name: None,
                    description: Some("Show table storage, rows and data length".into()),
                    created_at: Utc::now().timestamp_millis(),
                },
                DbSavedQuery {
                    id: Uuid::new_v4().to_string(),
                    title: "Active Connections & Activity".into(),
                    query: "SELECT pid, usename, state, query FROM pg_stat_activity WHERE state != 'idle';".into(),
                    engine: Some("postgres".into()),
                    db_connection_id: None,
                    db_name: None,
                    description: Some("List non-idle PostgreSQL queries and clients".into()),
                    created_at: Utc::now().timestamp_millis(),
                }
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_folder_type_persistence() {
        let json = r#"{"id":"f1","name":"DB Prod","parent_id":null,"type":"db"}"#;
        let folder: Folder = serde_json::from_str(json).unwrap();
        assert_eq!(folder.r#type, Some("db".to_string()));

        let serialized = serde_json::to_string(&folder).unwrap();
        assert!(serialized.contains(r#""type":"db""#));
    }

    #[test]
    fn test_db_config_folder_and_color_persistence() {
        let json = r#"{"id":"db1","name":"Postgres","engine":"postgres","folder_id":"f1","color":"emerald"}"#;
        let db: crate::dbms::DbConnectionConfig = serde_json::from_str(json).unwrap();
        assert_eq!(db.folder_id, Some("f1".to_string()));
        assert_eq!(db.color, Some("emerald".to_string()));

        let serialized = serde_json::to_string(&db).unwrap();
        assert!(serialized.contains(r#""folder_id":"f1""#));
        assert!(serialized.contains(r#""color":"emerald""#));
    }
}
