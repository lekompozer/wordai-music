use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

/// Read Google OAuth credentials.
/// Priority: runtime env var → compile-time embedded (option_env! → baked during `npx tauri build`).
/// For production build: `GOOGLE_OAUTH_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx npx tauri build`
/// The values are then baked into the binary and work even when launched from Finder/Dock.
fn get_google_credentials() -> Result<(String, String), String> {
    // 1. Runtime env (dev / CI override)
    let client_id = std::env::var("GOOGLE_OAUTH_CLIENT_ID")
        .unwrap_or_else(|_| option_env!("GOOGLE_OAUTH_CLIENT_ID").unwrap_or("").to_string());
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .unwrap_or_else(|_| option_env!("GOOGLE_CLIENT_SECRET").unwrap_or("").to_string());

    if client_id.is_empty() {
        return Err("Google OAuth not configured: set GOOGLE_OAUTH_CLIENT_ID".to_string());
    }
    if client_secret.is_empty() {
        return Err("Google OAuth not configured: set GOOGLE_CLIENT_SECRET".to_string());
    }
    Ok((client_id, client_secret))
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AuthResult {
    pub id_token: String,
    pub access_token: String,
    pub email: String,
}

#[derive(Deserialize, Debug)]
struct TokenResponse {
    id_token: Option<String>,
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize, Debug)]
struct UserInfoResponse {
    email: Option<String>,
}

fn generate_pkce_pair() -> (String, String) {
    let mut bytes = [0u8; 64];
    rand::thread_rng().fill_bytes(&mut bytes);
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());
    (verifier, challenge)
}

/// Get the frontend base URL.
/// In dev mode: $DESKTOP_FRONTEND_URL (e.g. http://localhost:3001)
/// In production: http://localhost:3001 (tauri-plugin-localhost serves the app at this port)
/// IMPORTANT: Must match the port used in tauri_plugin_localhost::Builder::new(3001)
/// so that after OAuth navigation, window.location.origin stays http://localhost:3001
/// (the origin YouTube IFrame API accepts).
fn get_frontend_base() -> String {
    std::env::var("DESKTOP_FRONTEND_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string())
}

/// Open system browser + start local HTTP server to catch OAuth callback.
/// Standard Desktop OAuth pattern (VS Code, GitHub CLI, Spotify).
/// Uses http://localhost:{random_port} — Google allows any localhost port for Desktop apps.
#[tauri::command]
pub async fn open_google_auth(app: AppHandle) -> Result<String, String> {
    // Bind port=0 → OS assigns free port → keep the listener alive until we pass it to task
    let std_listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind: {}", e))?;
    std_listener.set_nonblocking(true)
        .map_err(|e| format!("set_nonblocking failed: {}", e))?;
    let port = std_listener.local_addr().unwrap().port();

    // Use explicit 127.0.0.1 instead of "localhost" to avoid IPv6 resolution.
    // On macOS, Chrome may resolve "localhost" → ::1 (IPv6) while Rust listens
    // on 127.0.0.1 (IPv4) → "connection refused" → callback never received.
    // Google allows any localhost port for Desktop OAuth clients.
    let redirect_uri = format!("http://127.0.0.1:{}", port);
    let (verifier, challenge) = generate_pkce_pair();
    let (client_id, client_secret) = get_google_credentials()?;

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth\
        ?client_id={}\
        &redirect_uri={}\
        &response_type=code\
        &scope=openid%20email%20profile\
        &code_challenge={}\
        &code_challenge_method=S256\
        &access_type=offline\
        &prompt=select_account",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        challenge,
    );

    log::info!("Opening Google OAuth URL (port={})", port);
    log::info!("[Auth] frontend_base={}  client_id={}...",
        get_frontend_base(),
        &client_id.chars().take(12).collect::<String>(),
    );

    // Open system default browser (Safari on macOS)
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    // Spawn async task — pass the already-bound listener to avoid race condition
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        match wait_for_callback(std_listener, &verifier, &redirect_uri, &client_id, &client_secret).await {
            Ok(result) => {
                log::info!("OAuth success for: {}", result.email);

                // Method 1: Tauri event (may not work if IPC bridge is unavailable for external URLs)
                let _ = app_handle.emit("google-auth-result", &result);

                // Method 2: Navigate WKWebView to /desktop-auth with tokens in URL hash.
                // This is the most reliable approach — no IPC, no event listeners, no timing issues.
                // Tokens go in the hash (#) which is never sent to the server.
                // URL-encode tokens so special chars (=, +, /) don't break the URL.
                let id_token_enc = urlencoding::encode(&result.id_token).into_owned();
                let access_token_enc = urlencoding::encode(&result.access_token).into_owned();
                let email_enc = urlencoding::encode(&result.email).into_owned();
                let target = format!(
                    "{}/desktop-auth#id_token={}&access_token={}&email={}",
                    get_frontend_base(),
                    id_token_enc, access_token_enc, email_enc
                );
                let js = format!("window.location.href = '{}';", target);
                if let Some(win) = app_handle.get_webview_window("main") {
                    let _ = win.eval(&js);
                    log::info!("Navigating WKWebView to /desktop-auth (base={}) for: {}",
                        get_frontend_base(), result.email);
                } else {
                    log::error!("Could not get webview window 'main' for navigation");
                }
            }
            Err(e) => {
                log::error!("OAuth error: {}", e);
                let _ = app_handle.emit("google-auth-error", e.clone());
                // Navigate to /desktop-auth with error in hash
                if let Some(win) = app_handle.get_webview_window("main") {
                    let err_enc = urlencoding::encode(&e).into_owned();
                    let js = format!(
                        "window.location.href = '{}/desktop-auth#error={}'; ",
                        get_frontend_base(), err_enc
                    );
                    let _ = win.eval(&js);
                }
            }
        }
    });

    Ok(format!("Browser opened, listening on port {}", port))
}

async fn wait_for_callback(
    std_listener: std::net::TcpListener,
    verifier: &str,
    redirect_uri: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<AuthResult, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    // Convert std listener to tokio (non-blocking already set)
    let listener = TcpListener::from_std(std_listener)
        .map_err(|e| format!("from_std failed: {}", e))?;

    log::info!("Waiting for OAuth callback...");

    // Accept exactly one connection — that's the browser redirect.
    // Timeout after 120s so the task doesn't hang forever if user closes browser.
    let accept_result = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        listener.accept(),
    ).await;

    let (mut stream, _) = match accept_result {
        Ok(Ok(conn)) => conn,
        Ok(Err(e)) => return Err(format!("Accept error: {}", e)),
        Err(_) => return Err("OAuth timeout: browser did not complete login within 120 seconds".to_string()),
    };

    // Read the HTTP GET request
    let mut buf = vec![0u8; 8192];
    let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..n]);
    log::info!("Callback: {}", request.lines().next().unwrap_or("(empty)"));

    // Extract `code` query param from: "GET /?code=XXX&scope=... HTTP/1.1"
    let code = extract_query_param(&request, "code").ok_or_else(|| {
        if let Some(err) = extract_query_param(&request, "error") {
            format!("Google OAuth denied: {}", err)
        } else {
            format!("No code in callback. Path: {}", request.lines().next().unwrap_or(""))
        }
    })?;

    // Send success HTML so the user sees a nice page
    let html = "<!DOCTYPE html><html><head><meta charset='utf-8'>\
        <style>body{font-family:-apple-system,sans-serif;text-align:center;padding:80px 20px;\
        background:#0f0f0f;color:#fff}h2{color:#a855f7}p{color:#9ca3af;margin-top:16px}</style></head>\
        <body><h2>&#10003; Đăng nhập thành công!</h2>\
        <p>Bạn có thể đóng tab này và quay lại ứng dụng <strong>WordAI</strong>.</p></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
        Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    let _ = stream.write_all(response.as_bytes()).await;
    drop(stream);

    // Exchange authorization code for tokens
    exchange_code_for_tokens(&code, verifier, redirect_uri, client_id, client_secret).await
}

fn extract_query_param(request: &str, param: &str) -> Option<String> {
    // First line: "GET /path?key=val&key2=val2 HTTP/1.1"
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.splitn(2, '?').nth(1)?;

    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == param {
                return Some(urlencoding::decode(v).unwrap_or_default().into_owned());
            }
        }
    }
    None
}

async fn exchange_code_for_tokens(
    code: &str,
    verifier: &str,
    redirect_uri: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<AuthResult, String> {
    let client = reqwest::Client::new();

    log::info!("Exchanging code for tokens...");

    let token_res: TokenResponse = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier),
        ])
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Token parse failed: {}", e))?;

    if let Some(err) = token_res.error {
        return Err(format!(
            "Token exchange error: {} — {}",
            err,
            token_res.error_description.unwrap_or_default()
        ));
    }

    let id_token = token_res.id_token.ok_or("No id_token in response")?;
    let access_token = token_res.access_token.ok_or("No access_token in response")?;

    // Get user email from Google
    let user_info: UserInfoResponse = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("UserInfo request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("UserInfo parse failed: {}", e))?;

    Ok(AuthResult {
        id_token,
        access_token,
        email: user_info.email.unwrap_or_default(),
    })
}
