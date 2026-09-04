use base64::Engine;
use russh_keys::key::KeyPair;

/// Convert an unencrypted or decrypted PuTTY .ppk (v2 or v3) file into an OpenSSH KeyPair
pub fn parse_ppk_to_keypair(ppk_text: &str, _passphrase: Option<&str>) -> Result<KeyPair, String> {
    let lines: Vec<&str> = ppk_text.lines().map(|l| l.trim()).collect();
    if lines.is_empty() || !lines[0].starts_with("PuTTY-User-Key-File") {
        return Err("Not a valid PuTTY PPK file".into());
    }

    let header_parts: Vec<&str> = lines[0].split(':').collect();
    if header_parts.len() < 2 {
        return Err("Malformed PuTTY header".into());
    }
    let key_type = header_parts[1].trim();

    let mut encryption = "none";
    let mut i = 1;

    let mut pub_b64 = String::new();
    let mut priv_b64 = String::new();

    while i < lines.len() {
        let line = lines[i];
        if line.starts_with("Encryption:") {
            encryption = line.split(':').nth(1).unwrap_or("none").trim();
            i += 1;
        } else if line.starts_with("Public-Lines:") {
            let count: usize = line.split(':').nth(1).unwrap_or("0").trim().parse().unwrap_or(0);
            i += 1;
            for _ in 0..count {
                if i < lines.len() {
                    pub_b64.push_str(lines[i]);
                    i += 1;
                }
            }
        } else if line.starts_with("Private-Lines:") {
            let count: usize = line.split(':').nth(1).unwrap_or("0").trim().parse().unwrap_or(0);
            i += 1;
            for _ in 0..count {
                if i < lines.len() {
                    priv_b64.push_str(lines[i]);
                    i += 1;
                }
            }
        } else {
            i += 1;
        }
    }

    if encryption != "none" {
        return Err("Encrypted PuTTY .ppk files with passphrase are not yet supported directly. Please export an unencrypted OpenSSH key via PuTTYgen.".into());
    }

    let pub_bytes = base64::engine::general_purpose::STANDARD
        .decode(&pub_b64)
        .map_err(|e| format!("Invalid Base64 in PPK Public-Lines: {}", e))?;
    let priv_bytes = base64::engine::general_purpose::STANDARD
        .decode(&priv_b64)
        .map_err(|e| format!("Invalid Base64 in PPK Private-Lines: {}", e))?;

    // Build OpenSSH v1 format binary payload:
    // "openssh-key-v1\0" + cipher("none") + kdf("none") + kdf_opts("") + num_keys(1) + pubkey + priv_blob
    let mut openssh_bin = Vec::new();
    openssh_bin.extend_from_slice(b"openssh-key-v1\0");

    // ciphername = "none"
    write_ssh_string(&mut openssh_bin, b"none");
    // kdfname = "none"
    write_ssh_string(&mut openssh_bin, b"none");
    // kdfoptions = ""
    write_ssh_string(&mut openssh_bin, b"");
    // number of keys = 1 (u32 BE)
    openssh_bin.extend_from_slice(&1u32.to_be_bytes());
    // public key blob
    write_ssh_string(&mut openssh_bin, &pub_bytes);

    // Private key section
    let mut priv_blob = Vec::new();
    let checkint: u32 = 0x12345678;
    priv_blob.extend_from_slice(&checkint.to_be_bytes());
    priv_blob.extend_from_slice(&checkint.to_be_bytes());

    if key_type == "ssh-ed25519" {
        write_ssh_string(&mut priv_blob, b"ssh-ed25519");
        // in PPK, public blob has format: string "ssh-ed25519" + 32-byte pubkey
        let pub_key_only = if pub_bytes.len() > 19 {
            &pub_bytes[pub_bytes.len() - 32..]
        } else {
            &pub_bytes[..]
        };

        // in PPK ed25519 private blob is 32-byte seed / priv scalar
        let priv_key_only = if priv_bytes.len() >= 32 {
            &priv_bytes[priv_bytes.len() - 32..]
        } else {
            &priv_bytes[..]
        };

        write_ssh_string(&mut priv_blob, pub_key_only);

        // OpenSSH private key for ed25519 is 64 bytes (32-byte priv + 32-byte pub)
        let mut full_ed25519 = Vec::new();
        full_ed25519.extend_from_slice(priv_key_only);
        full_ed25519.extend_from_slice(pub_key_only);
        write_ssh_string(&mut priv_blob, &full_ed25519);
        // comment
        write_ssh_string(&mut priv_blob, b"imported-from-ppk");
    } else if key_type == "ssh-rsa" {
        write_ssh_string(&mut priv_blob, b"ssh-rsa");
        // Extract n and e from public blob
        let (n_bytes, e_bytes) = extract_rsa_pub(&pub_bytes)?;
        write_ssh_mpint(&mut priv_blob, &n_bytes);
        write_ssh_mpint(&mut priv_blob, &e_bytes);

        // PuTTY RSA private key stores: [d, p, q, iqmp]
        // OpenSSH RSA private key expects: [d, iqmp, p, q]
        let mut off = 0;
        let d = read_ssh_mpint(&priv_bytes, &mut off)?;
        let p = read_ssh_mpint(&priv_bytes, &mut off)?;
        let q = read_ssh_mpint(&priv_bytes, &mut off)?;
        let iqmp = read_ssh_mpint(&priv_bytes, &mut off)?;

        write_ssh_mpint(&mut priv_blob, d);
        write_ssh_mpint(&mut priv_blob, iqmp);
        write_ssh_mpint(&mut priv_blob, p);
        write_ssh_mpint(&mut priv_blob, q);

        // comment
        write_ssh_string(&mut priv_blob, b"imported-from-ppk");
    } else {
        return Err(format!("Unsupported PPK key type: '{}'. Please use OpenSSH format.", key_type));
    }

    // Padding (1..=8 bytes so total length is multiple of 8)
    let pad_len = 8 - (priv_blob.len() % 8);
    for p in 1..=pad_len {
        priv_blob.push(p as u8);
    }

    write_ssh_string(&mut openssh_bin, &priv_blob);

    let b64_openssh = base64::engine::general_purpose::STANDARD.encode(&openssh_bin);
    let mut pem = String::from("-----BEGIN OPENSSH PRIVATE KEY-----\n");
    for chunk in b64_openssh.as_bytes().chunks(70) {
        pem.push_str(std::str::from_utf8(chunk).unwrap_or(""));
        pem.push('\n');
    }
    pem.push_str("-----END OPENSSH PRIVATE KEY-----\n");

    russh_keys::decode_secret_key(&pem, None)
        .map_err(|e| format!("Failed to load parsed OpenSSH key: {}", e))
}

fn write_ssh_string(buf: &mut Vec<u8>, data: &[u8]) {
    buf.extend_from_slice(&(data.len() as u32).to_be_bytes());
    buf.extend_from_slice(data);
}

fn write_ssh_mpint(buf: &mut Vec<u8>, data: &[u8]) {
    let mut start = 0;
    while start < data.len() && data[start] == 0 {
        start += 1;
    }
    if start == data.len() {
        buf.extend_from_slice(&0u32.to_be_bytes());
        return;
    }
    let trimmed = &data[start..];
    if (trimmed[0] & 0x80) != 0 {
        buf.extend_from_slice(&((trimmed.len() + 1) as u32).to_be_bytes());
        buf.push(0x00);
        buf.extend_from_slice(trimmed);
    } else {
        buf.extend_from_slice(&(trimmed.len() as u32).to_be_bytes());
        buf.extend_from_slice(trimmed);
    }
}

fn read_ssh_mpint<'a>(buf: &'a [u8], offset: &mut usize) -> Result<&'a [u8], String> {
    if *offset + 4 > buf.len() {
        return Err("Unexpected EOF reading mpint length".into());
    }
    let len = u32::from_be_bytes(buf[*offset..*offset + 4].try_into().unwrap()) as usize;
    *offset += 4;
    if *offset + len > buf.len() {
        return Err(format!("Unexpected EOF reading mpint data: len={}, available={}", len, buf.len() - *offset));
    }
    let slice = &buf[*offset..*offset + len];
    *offset += len;
    Ok(slice)
}

fn extract_rsa_pub(pub_bytes: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    let mut offset = 0;
    if pub_bytes.len() < 4 {
        return Err("Invalid RSA public key blob".into());
    }

    // skip key type string "ssh-rsa"
    let len = u32::from_be_bytes(pub_bytes[offset..offset + 4].try_into().unwrap()) as usize;
    offset += 4 + len;

    // read e
    if offset + 4 > pub_bytes.len() {
        return Err("Malformed RSA e component".into());
    }
    let e_len = u32::from_be_bytes(pub_bytes[offset..offset + 4].try_into().unwrap()) as usize;
    offset += 4;
    let e = pub_bytes[offset..offset + e_len].to_vec();
    offset += e_len;

    // read n
    if offset + 4 > pub_bytes.len() {
        return Err("Malformed RSA n component".into());
    }
    let n_len = u32::from_be_bytes(pub_bytes[offset..offset + 4].try_into().unwrap()) as usize;
    offset += 4;
    let n = pub_bytes[offset..offset + n_len].to_vec();

    Ok((n, e))
}
