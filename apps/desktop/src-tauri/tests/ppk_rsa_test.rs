use boba_lib::ppk::parse_ppk_to_keypair;
use base64::Engine;

#[test]
fn test_ppk_rsa_roundtrip() {
    let key = ssh_key::PrivateKey::random(&mut rand::thread_rng(), ssh_key::Algorithm::Rsa { hash: None }).unwrap();
    if let ssh_key::private::KeypairData::Rsa(rsa) = key.key_data() {
        let n = rsa.public.n.as_bytes();
        let e = rsa.public.e.as_bytes();
        let d = rsa.private.d.as_bytes();
        let p = rsa.private.p.as_bytes();
        let q = rsa.private.q.as_bytes();
        let iqmp = rsa.private.iqmp.as_bytes();

        let mut pub_bytes = Vec::new();
        fn write_str(buf: &mut Vec<u8>, s: &[u8]) {
            buf.extend_from_slice(&(s.len() as u32).to_be_bytes());
            buf.extend_from_slice(s);
        }
        fn write_mp(buf: &mut Vec<u8>, data: &[u8]) {
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

        write_str(&mut pub_bytes, b"ssh-rsa");
        write_mp(&mut pub_bytes, e);
        write_mp(&mut pub_bytes, n);

        let mut priv_bytes = Vec::new();
        write_mp(&mut priv_bytes, d);
        write_mp(&mut priv_bytes, p);
        write_mp(&mut priv_bytes, q);
        write_mp(&mut priv_bytes, iqmp);

        let pub_b64 = base64::engine::general_purpose::STANDARD.encode(&pub_bytes);
        let priv_b64 = base64::engine::general_purpose::STANDARD.encode(&priv_bytes);

        let ppk_text = format!(
            "PuTTY-User-Key-File-2: ssh-rsa\n\
Encryption: none\n\
Comment: test-rsa\n\
Public-Lines: 1\n\
{}\n\
Private-Lines: 1\n\
{}\n\
Private-MAC: dummy",
            pub_b64, priv_b64
        );

        let res = parse_ppk_to_keypair(&ppk_text, None);
        assert!(res.is_ok(), "Failed to parse PPK RSA key: {:?}", res.err());
    }
}
