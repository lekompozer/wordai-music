mod google_auth;

use tauri::{WebviewWindowBuilder, WebviewUrl};

#[tauri::command]
fn get_app_build_info() -> serde_json::Value {
    serde_json::json!({
        "build": env!("APP_BUILD_NUMBER"),
        "version": env!("CARGO_PKG_VERSION"),
    })
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_updater::UpdaterExt;
    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => Ok(serde_json::json!({
                "available": true,
                "version": update.version,
                "currentVersion": update.current_version,
                "body": update.body,
            })),
            Ok(None) => Ok(serde_json::json!({ "available": false })),
            Err(e) => Err(format!("Update check failed: {e}")),
        },
        Err(e) => Err(format!("Updater unavailable: {e}")),
    }
}

#[tauri::command]
async fn download_and_install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| format!("Updater unavailable: {e}"))?;
    let update = updater.check().await
        .map_err(|e| format!("Update check failed: {e}"))?
        .ok_or_else(|| "Already up to date".to_string())?;
    update.download_and_install(|_downloaded, _total| {}, || {})
        .await
        .map_err(|e| format!("Install failed: {e}"))?;
    app.restart();
}

#[tauri::command]
fn read_audio_files_in_dir(dir_path: String) -> Result<Vec<serde_json::Value>, String> {
    let audio_ext = ["mp3", "flac", "m4a", "wav", "ogg", "aac", "opus", "wma", "aiff",
                      "mp4", "mov", "webm", "mkv", "m4v"];
    let path = std::path::Path::new(&dir_path);
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }
    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut files: Vec<serde_json::Value> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if !p.is_file() { return None; }
            let ext = p.extension()?.to_str()?.to_lowercase();
            if !audio_ext.contains(&ext.as_str()) { return None; }
            let name = p.file_name()?.to_str()?.to_string();
            let full = p.to_str()?.to_string();
            Some(serde_json::json!({ "path": full, "name": name }))
        })
        .collect();
    files.sort_by(|a, b| {
        a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or(""))
    });
    Ok(files)
}

/// Copy a list of files into the app's managed playlists directory.
/// Creates `{app_data_dir}/playlists/{playlist_id}/` if it doesn't exist.
/// Returns the destination paths so the caller can build asset:// URLs.
#[tauri::command]
async fn copy_files_to_playlist_dir(
    app: tauri::AppHandle,
    playlist_id: String,
    file_paths: Vec<String>,
) -> Result<Vec<serde_json::Value>, String> {
    use tauri::Manager;
    let app_data = app.path().app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let dest_dir = app_data.join("playlists").join(&playlist_id);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for src in &file_paths {
        let src_path = std::path::Path::new(src);
        let file_name = src_path.file_name()
            .ok_or_else(|| format!("No filename: {src}"))?
            .to_string_lossy()
            .to_string();

        // Avoid collisions: if the file already exists, add a numeric suffix
        let mut dest = dest_dir.join(&file_name);
        if dest.exists() {
            let stem = src_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let ext = src_path.extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default();
            let mut counter = 1u32;
            loop {
                let new_name = if ext.is_empty() {
                    format!("{stem}_{counter}")
                } else {
                    format!("{stem}_{counter}.{ext}")
                };
                dest = dest_dir.join(&new_name);
                if !dest.exists() { break; }
                counter += 1;
            }
        }

        std::fs::copy(src_path, &dest).map_err(|e| e.to_string())?;
        result.push(serde_json::json!({
            "srcPath": src,
            "destPath": dest.to_string_lossy().to_string(),
        }));
    }
    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // tauri-plugin-localhost only needed in production to serve ../out/ at port 3001.
    // In dev mode, Next.js already runs on port 3001 — adding the plugin would cause a port conflict.
    #[cfg(not(dev))]
    let builder = builder.plugin(tauri_plugin_localhost::Builder::new(3001).build());

    builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            // In production, tauri-plugin-localhost serves ../out/ via HTTP at port 3001.
            // Using ExternalUrl makes window.location.origin = "http://localhost:3001"
            // which is the same origin as dev mode — YouTube IFrame API accepts this.
            // Both dev and prod load via http://localhost:3001.
            // In prod: tauri-plugin-localhost serves ../out/ at port 3001.
            // In dev: Next.js dev server runs at port 3001 (started by beforeDevCommand).
            // WebviewUrl::App("index.html") would load /index.html which 404s in Next.js dev server.
            let webview_url = WebviewUrl::External(
                "http://localhost:3001".parse().expect("invalid localhost url"),
            );

            let builder = WebviewWindowBuilder::new(
                app,
                "main",
                webview_url,
            )
            .title("WynAI Music")
            .inner_size(1100.0, 780.0)
            .min_inner_size(800.0, 600.0)
            .center()
            .resizable(true)
            // Spoof Safari UA so YouTube iframe accepts the embedded player
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15")
            .initialization_script(
                "window.__TAURI_DESKTOP__ = true; \
                 window.__WORDAI_ERRORS__ = []; \
                 console.log('[WynAI Music] v0.1.0 desktop runtime active');"
            )
            // Enable DevTools in all builds for debugging
            .devtools(true);

            // macOS-only: hidden title bar — shows traffic lights but no title text,
            // content fills the full window height. MusicHeader sits below the traffic lights.
            #[cfg(target_os = "macos")]
            let builder = builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true);

            let _window = builder.build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_build_info,
            check_for_updates,
            download_and_install_update,
            google_auth::open_google_auth,
            read_audio_files_in_dir,
            copy_files_to_playlist_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WynAI Music");
}
