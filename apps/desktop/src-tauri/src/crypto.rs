use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use sha2::{Digest, Sha256};

pub struct CryptoEngine;

impl CryptoEngine {
    /// Derive 32-byte (256-bit) encryption key from master password and user salt
    pub fn derive_master_key(password: &str, salt: &str) -> Result<[u8; 32], String> {
        let mut key = [0u8; 32];
        let argon2 = Argon2::default();
        
        argon2
            .hash_password_into(password.as_bytes(), salt.as_bytes(), &mut key)
            .map_err(|e| format!("Argon2 derivation error: {}", e))?;
            
        Ok(key)
    }

    /// Encrypt plaintext string using AES-256-GCM -> Base64 ciphertext (nonce + ciphertext + tag)
    pub fn encrypt(key: &[u8; 32], plaintext: &str) -> Result<String, String> {
        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| format!("Cipher init error: {}", e))?;
            
        let mut nonce_bytes = [0u8; 12];
        use rand::RngCore;
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| format!("Encryption error: {}", e))?;

        // Combined: 12 bytes nonce + ciphertext (with embedded tag)
        let mut combined = Vec::with_capacity(12 + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);

        Ok(BASE64.encode(combined))
    }

    /// Decrypt Base64 ciphertext using AES-256-GCM -> Plaintext string
    pub fn decrypt(key: &[u8; 32], encoded_ciphertext: &str) -> Result<String, String> {
        let combined = BASE64
            .decode(encoded_ciphertext)
            .map_err(|e| format!("Base64 decode error: {}", e))?;

        if combined.len() < 12 {
            return Err("Ciphertext too short (missing nonce)".into());
        }

        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| format!("Cipher init error: {}", e))?;

        let plaintext_bytes = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| format!("Decryption error: Master password might be incorrect. ({})", e))?;

        String::from_utf8(plaintext_bytes)
            .map_err(|e| format!("UTF-8 decode error: {}", e))
    }

    /// Compute SHA256 checksum hex string
    pub fn compute_sha256(data: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data.as_bytes());
        hex::encode(hasher.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encryption_decryption_roundtrip() {
        let password = "MySuperMasterPassword123!";
        let salt = "some_random_user_salt_hex_string_12345";
        let key = CryptoEngine::derive_master_key(password, salt).unwrap();

        let secret_data = r#"{"sessions":[{"name":"Production VPS","host":"10.0.0.1"}]}"#;
        let encrypted = CryptoEngine::encrypt(&key, secret_data).unwrap();
        let decrypted = CryptoEngine::decrypt(&key, &encrypted).unwrap();

        assert_eq!(secret_data, decrypted);
    }
}
