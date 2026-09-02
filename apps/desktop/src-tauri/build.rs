use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=dlls");
    
    // Copy DLLs to target output directory for standalone execution
    if let Ok(out_dir) = env::var("OUT_DIR") {
        let out_path = PathBuf::from(out_dir);
        // Navigate up to target/release or target/debug
        if let Some(target_dir) = out_path.ancestors().nth(3) {
            let dll_src = PathBuf::from("dlls");
            if dll_src.exists() {
                if let Ok(entries) = fs::read_dir(dll_src) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            if let Some(file_name) = path.file_name() {
                                let dest = target_dir.join(file_name);
                                let _ = fs::copy(&path, dest);
                            }
                        }
                    }
                }
            }
        }
    }

    tauri_build::build();
}
