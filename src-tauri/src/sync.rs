// OneDrive sync — the native-only pieces of the sync spine.
//
// The portable sync logic (Graph calls, delta, conflict detection) lives in the
// web layer (src/lib/sync). Only three things genuinely need the native shell,
// and they live here:
//   * secret storage in the OS keychain (refresh token + Azure app config),
//   * a one-shot OAuth loopback server to catch the auth-code redirect,
//   * opening the system browser for the consent screen.
//
// Everything else the TS layer does over `fetch`.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

use keyring::Entry;
use serde::{Deserialize, Serialize};

// One keychain "service" namespace for all Pensieve secrets; the `key` arg is the
// account within it (e.g. "refresh-token", "azure-config").
const KEYCHAIN_SERVICE: &str = "xyz.erdman.pensieve.sync";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, key).map_err(|e| e.to_string())
}

/// Read a secret from the OS keychain. Missing → Ok(None), never an error, so the
/// TS "are we connected?" check is a plain null test.
#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Store (or replace) a secret in the OS keychain.
#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

/// Delete a secret. Absent is success (idempotent sign-out).
#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct HttpReq {
    method: String,
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    body: Option<String>,
}

#[derive(Serialize)]
pub struct HttpRes {
    status: u16,
    body: String,
    headers: HashMap<String, String>,
}

/// Make an HTTP request from the NATIVE side (no webview Origin header). This is how
/// the TS layer reaches Microsoft's token endpoint and Graph: a desktop app is a
/// native client, and a browser `fetch` would attach an Origin that trips CORS
/// (AADSTS90023 on token redemption). Header names come back lowercased.
#[tauri::command]
pub async fn http_request(req: HttpReq) -> Result<HttpRes, String> {
    tauri::async_runtime::spawn_blocking(move || http_blocking(req))
        .await
        .map_err(|e| e.to_string())?
}

fn http_blocking(req: HttpReq) -> Result<HttpRes, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .build();
    let mut r = agent.request(&req.method, &req.url);
    for (k, v) in &req.headers {
        r = r.set(k, v);
    }
    let result = match req.body {
        Some(b) => r.send_string(&b),
        None => r.call(),
    };
    let resp = match result {
        Ok(resp) => resp,
        // A non-2xx status is still a response we want to hand back (the TS layer
        // interprets 401/404/409/412/4xx), not a transport error.
        Err(ureq::Error::Status(_code, resp)) => resp,
        Err(e) => return Err(e.to_string()),
    };
    let status = resp.status();
    let mut headers = HashMap::new();
    for name in resp.headers_names() {
        if let Some(val) = resp.header(&name) {
            headers.insert(name.to_lowercase(), val.to_string());
        }
    }
    let body = resp.into_string().map_err(|e| e.to_string())?;
    Ok(HttpRes { status, body, headers })
}

/// True if we can bind the loopback port the OAuth redirect needs. Checked before
/// opening the browser so a port owned by another app (e.g. a dev server on 3000)
/// produces a clear message instead of a redirect that lands on the wrong app.
#[tauri::command]
pub fn port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Open a URL in the user's default browser (the OAuth consent screen).
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    // Loopback-only URLs and the Microsoft authorize endpoint are all we open; we
    // still sanity-check the scheme so a bad caller can't shell out to something
    // unexpected.
    if !(url.starts_with("https://") || url.starts_with("http://localhost")) {
        return Err("refusing to open non-https url".into());
    }
    #[cfg(target_os = "macos")]
    let prog = "open";
    #[cfg(target_os = "windows")]
    let prog = "cmd";
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let prog = "xdg-open";

    #[cfg(target_os = "windows")]
    let args: Vec<&str> = vec!["/C", "start", "", &url];
    #[cfg(not(target_os = "windows"))]
    let args: Vec<&str> = vec![&url];

    std::process::Command::new(prog)
        .args(&args)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct AuthCode {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

/// Start a one-shot loopback HTTP server and wait for the OAuth redirect.
///
/// The registered redirect for the reused Azure app is a "Web" platform URI,
/// `http://localhost:<port><path>` (3000 / `/api/auth/callback`). The system
/// browser lands there after consent with `?code=…&state=…` (or `?error=…`); we
/// capture the query, answer with a friendly close-me page, and hand the values
/// back to the TS layer which does the PKCE code exchange.
///
/// Call this WITHOUT awaiting, then `open_url`, then await — the socket binds as
/// soon as the command starts so no redirect is missed.
#[tauri::command]
pub async fn oauth_listen(port: u16, path: String, timeout_secs: u64) -> Result<AuthCode, String> {
    tauri::async_runtime::spawn_blocking(move || listen_blocking(port, &path, timeout_secs))
        .await
        .map_err(|e| e.to_string())?
}

fn listen_blocking(port: u16, path: &str, timeout_secs: u64) -> Result<AuthCode, String> {
    let listener =
        TcpListener::bind(("127.0.0.1", port)).map_err(|e| format!("bind {port}: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;

    let deadline = Instant::now() + Duration::from_secs(timeout_secs.max(5));

    loop {
        if Instant::now() > deadline {
            return Err("timed out waiting for the sign-in redirect".into());
        }
        match listener.accept() {
            Ok((mut stream, _addr)) => {
                // Read the request line (first line is enough: "GET /path?query HTTP/1.1").
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]);
                let first = req.lines().next().unwrap_or("");
                let target = first.split_whitespace().nth(1).unwrap_or("");

                let req_path = target.split('?').next().unwrap_or("");
                if req_path != path {
                    // favicon and the like — answer 404, keep waiting for the real one.
                    let _ = stream.write_all(
                        b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    );
                    continue;
                }

                let query = target.split('?').nth(1).unwrap_or("");
                let (mut code, mut state, mut error) = (None, None, None);
                for pair in query.split('&') {
                    let mut it = pair.splitn(2, '=');
                    let k = it.next().unwrap_or("");
                    let v = it.next().unwrap_or("");
                    let v = url_decode(v);
                    match k {
                        "code" => code = Some(v),
                        "state" => state = Some(v),
                        "error" => error = Some(v),
                        _ => {}
                    }
                }

                let body = CLOSE_PAGE.as_bytes();
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(header.as_bytes());
                let _ = stream.write_all(body);
                let _ = stream.flush();

                return Ok(AuthCode { code, state, error });
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Minimal percent-decoding for OAuth query values (handles %XX and '+').
fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hi = hex_val(bytes[i + 1]);
                let lo = hex_val(bytes[i + 2]);
                if let (Some(h), Some(l)) = (hi, lo) {
                    out.push(h * 16 + l);
                    i += 3;
                    continue;
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

const CLOSE_PAGE: &str = "<!doctype html><html><head><meta charset=utf-8><title>Pensieve</title>\
<style>html{color-scheme:light dark}body{font:16px -apple-system,system-ui,sans-serif;\
display:grid;place-items:center;height:100vh;margin:0}div{text-align:center;opacity:.85}\
h1{font-size:1.1rem;font-weight:600;margin:0 0 .4rem}p{margin:0;opacity:.6;font-size:.9rem}\
</style></head><body><div><h1>Pensieve is connected ✓</h1>\
<p>You can close this tab and return to the app.</p></div>\
<script>window.setTimeout(function(){window.close()},800)</script></body></html>";
