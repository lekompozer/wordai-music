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
fn read_audio_files_in_dir(dir_path: String) -> Result<Vec<serde_json::Value>, String> {
    let audio_ext = ["mp3", "flac", "m4a", "wav", "ogg", "aac", "opus", "wma", "aiff"];
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Serve the app from http://localhost:14789 so YouTube embed API gets a valid HTTP origin
        .plugin(tauri_plugin_localhost::Builder::new(14789).build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            let builder = WebviewWindowBuilder::new(
                app,
                "main",
                // Production: load local static files (next export output in ../out/)
                // Dev: load from Next.js dev server (devUrl in tauri.conf.json)
                WebviewUrl::App("index.html".into()),
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
            google_auth::open_google_auth,
            read_audio_files_in_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WynAI Music");
}
