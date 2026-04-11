fn main() {
    // Auto-increment build number
    let build_file = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("build_number.txt");
    let current: u32 = std::fs::read_to_string(&build_file)
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0);
    let next = current + 1;
    let _ = std::fs::write(&build_file, next.to_string());
    println!("cargo:rustc-env=APP_BUILD_NUMBER={}", next);

    // Only re-run when real source changes
    println!("cargo:rerun-if-changed=src/lib.rs");
    println!("cargo:rerun-if-changed=Cargo.toml");

    // Bake OAuth credentials into binary at compile time
    if let Ok(v) = std::env::var("GOOGLE_OAUTH_CLIENT_ID") {
        println!("cargo:rustc-env=GOOGLE_OAUTH_CLIENT_ID={}", v);
    }
    if let Ok(v) = std::env::var("GOOGLE_CLIENT_SECRET") {
        println!("cargo:rustc-env=GOOGLE_CLIENT_SECRET={}", v);
    }

    tauri_build::build()
}
