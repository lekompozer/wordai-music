// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "macos")]
    {
        // Chặn macOS App Nap & System Sleep khi WKWebView bị ẩn/thu nhỏ (gây tắt nhạc sau 1-2 phút)
        std::process::Command::new("caffeinate")
            .args(&["-i", "-m", "-s", "-w", &std::process::id().to_string()])
            .spawn()
            .ok();
    }

    #[cfg(target_os = "linux")]
    {
        use std::env;
        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        if env::var("GDK_BACKEND").is_err() {
            env::set_var("GDK_BACKEND", "x11");
        }
        env::set_var("GTK_MODULES", "");
    }

    wordai_music_lib::run()
}
