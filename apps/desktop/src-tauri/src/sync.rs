use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    #[serde(rename = "userId")]
    pub user_id: String,
    pub email: String,
    pub salt: String,
    pub token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultGetResponse {
    pub version: i64,
    #[serde(rename = "encryptedData")]
    pub encrypted_data: Option<String>,
    pub checksum: Option<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultPutRequest {
    #[serde(rename = "expectedVersion")]
    pub expected_version: i64,
    #[serde(rename = "encryptedData")]
    pub encrypted_data: String,
    pub checksum: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultPutResponse {
    pub version: i64,
    pub checksum: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Clone)]
pub struct SyncService {
    client: Client,
}

impl SyncService {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .unwrap_or_default(),
        }
    }

    pub async fn register(
        &self,
        server_url: &str,
        email: &str,
        password: &str,
    ) -> Result<AuthResponse, String> {
        let url = format!("{}/api/auth/register", server_url.trim_end_matches('/'));
        let res = self
            .client
            .post(&url)
            .json(&serde_json::json!({
                "email": email,
                "password": password
            }))
            .send()
            .await
            .map_err(|e| format!("Network request failed: {}", e))?;

        if !res.status().is_success() {
            let err_body: serde_json::Value = res.json().await.unwrap_or_default();
            let msg = err_body["message"].as_str().unwrap_or("Registration failed");
            return Err(msg.to_string());
        }

        res.json::<AuthResponse>()
            .await
            .map_err(|e| format!("Invalid server response: {}", e))
    }

    pub async fn login(
        &self,
        server_url: &str,
        email: &str,
        password: &str,
    ) -> Result<AuthResponse, String> {
        let url = format!("{}/api/auth/login", server_url.trim_end_matches('/'));
        let res = self
            .client
            .post(&url)
            .json(&serde_json::json!({
                "email": email,
                "password": password
            }))
            .send()
            .await
            .map_err(|e| format!("Network request failed: {}", e))?;

        if !res.status().is_success() {
            let err_body: serde_json::Value = res.json().await.unwrap_or_default();
            let msg = err_body["message"].as_str().unwrap_or("Invalid email or password");
            return Err(msg.to_string());
        }

        res.json::<AuthResponse>()
            .await
            .map_err(|e| format!("Invalid server response: {}", e))
    }

    pub async fn get_vault(
        &self,
        server_url: &str,
        token: &str,
    ) -> Result<VaultGetResponse, String> {
        let url = format!("{}/api/vault", server_url.trim_end_matches('/'));
        let res = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Network request failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            return Err(format!("Server returned HTTP {}", status));
        }

        res.json::<VaultGetResponse>()
            .await
            .map_err(|e| format!("Invalid vault response: {}", e))
    }

    pub async fn push_vault(
        &self,
        server_url: &str,
        token: &str,
        payload: VaultPutRequest,
    ) -> Result<VaultPutResponse, String> {
        let url = format!("{}/api/vault", server_url.trim_end_matches('/'));
        let res = self
            .client
            .put(&url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Network request failed: {}", e))?;

        if res.status().as_u16() == 409 {
            return Err("VERSION_CONFLICT".into());
        }

        if !res.status().is_success() {
            let status = res.status();
            return Err(format!("Sync push failed: HTTP {}", status));
        }

        res.json::<VaultPutResponse>()
            .await
            .map_err(|e| format!("Invalid sync response: {}", e))
    }
}
