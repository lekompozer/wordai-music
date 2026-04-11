// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
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
