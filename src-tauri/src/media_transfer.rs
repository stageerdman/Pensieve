// Native streaming transfer for large media. Graph's simple PUT/GET content calls are
// capped at ~4MB; anything bigger needs a resumable upload session (uploads) or
// Range-based chunked GETs (downloads). Both paths read/write the local vault file
// directly in Rust so a multi-GB recording never crosses the webview IPC boundary as
// one giant base64 string — doing that would either block the renderer's JS thread for
// a very long time or exceed V8's per-string length ceiling outright. Only small control
// values (paths, urls, offsets, progress ticks) cross the bridge; the bytes never do.
//
// Resume needs no local progress bookkeeping on the upload side — Graph tracks how
// many bytes of a session it has received server-side (queried from the TS layer via
// the session URL), so we only ever need to remember *which* session, not how far we
// got. Downloads resume from the size of an on-disk `.part` file — same idea, no
// separate state needed.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::resolve;

/// A multiple of Graph's required 320 KiB fragment alignment, inside its own
/// recommended 5-10 MiB "reliable connection" range.
const CHUNK_SIZE: u64 = 10 * 1024 * 1024;
/// Per-chunk HTTP timeout. Bounded so a stalled connection fails (and is retried)
/// within a couple of minutes instead of hanging the sync forever — this is the actual
/// fix for the old "Backing up…" state that never resolved.
const CHUNK_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_CHUNK_ATTEMPTS: u32 = 5;

#[derive(Serialize, Clone)]
struct TransferProgress<'a> {
    #[serde(rename = "ref")]
    media_ref: &'a str,
    sent: u64,
    total: u64,
}

/// Byte size of a vault-relative file without reading its contents — lets the TS sync
/// engine decide small-vs-large without ever loading media into JS memory to find out.
#[tauri::command]
pub fn media_size(app: AppHandle, rel: String) -> Result<Option<u64>, String> {
    let p = resolve(&app, &rel)?;
    match fs::metadata(&p) {
        Ok(m) => Ok(Some(m.len())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// True for a status that's worth retrying (transient) rather than failing fast. A
/// client error — bad range, expired/cancelled session, bad auth — won't fix itself.
fn is_retryable_status(status: u16) -> bool {
    status == 429 || status >= 500
}

/// The `Content-Range` header value for one chunk of a `total`-byte upload.
fn content_range(start: u64, end: u64, total: u64) -> String {
    format!("bytes {start}-{end}/{total}")
}

/// `<dir>/<name>.part` — the in-progress sidecar a chunked download writes to before
/// it's confirmed complete and renamed into place.
fn part_path_for(final_path: &Path) -> PathBuf {
    let name = final_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download");
    final_path.with_file_name(format!("{name}.part"))
}

/// PUT one chunk to a resumable upload session URL, retrying transient failures with
/// backoff. Returns the response body once Graph accepts the chunk (200/201 on the
/// final chunk with the DriveItem JSON, 202 on an intermediate one).
fn put_chunk_with_retry(
    agent: &ureq::Agent,
    upload_url: &str,
    buf: &[u8],
    start: u64,
    end: u64,
    total: u64,
) -> Result<String, String> {
    let range = content_range(start, end, total);
    let mut last_error = String::from("unknown error");
    for attempt in 0..MAX_CHUNK_ATTEMPTS {
        if attempt > 0 {
            std::thread::sleep(Duration::from_secs(1 << attempt.min(4)));
        }
        let result = agent
            .request("PUT", upload_url)
            .set("Content-Length", &buf.len().to_string())
            .set("Content-Range", &range)
            .send_bytes(buf);
        let resp = match result {
            Ok(r) => r,
            Err(ureq::Error::Status(_, r)) => r,
            Err(e) => {
                last_error = format!("transport error: {e}");
                continue;
            }
        };
        let status = resp.status();
        if status == 200 || status == 201 || status == 202 {
            return resp.into_string().map_err(|e| e.to_string());
        }
        let text = resp.into_string().unwrap_or_default();
        last_error = format!("status {status}: {}", text.chars().take(200).collect::<String>());
        if !is_retryable_status(status) {
            return Err(last_error);
        }
    }
    Err(format!(
        "chunk upload gave up after {MAX_CHUNK_ATTEMPTS} attempts ({last_error})"
    ))
}

/// GET one byte range, retrying transient failures with backoff. Returns the raw
/// chunk bytes (bounded by CHUNK_SIZE — never the whole file).
fn get_chunk_with_retry(
    agent: &ureq::Agent,
    url: &str,
    token: &str,
    start: u64,
    end: u64,
) -> Result<Vec<u8>, String> {
    let range = format!("bytes={start}-{end}");
    let mut last_error = String::from("unknown error");
    for attempt in 0..MAX_CHUNK_ATTEMPTS {
        if attempt > 0 {
            std::thread::sleep(Duration::from_secs(1 << attempt.min(4)));
        }
        let result = agent
            .request("GET", url)
            .set("Authorization", &format!("Bearer {token}"))
            .set("Range", &range)
            .call();
        let resp = match result {
            Ok(r) => r,
            Err(ureq::Error::Status(_, r)) => r,
            Err(e) => {
                last_error = format!("transport error: {e}");
                continue;
            }
        };
        let status = resp.status();
        if status == 200 || status == 206 {
            let mut buf = Vec::new();
            return resp
                .into_reader()
                .read_to_end(&mut buf)
                .map(|_| buf)
                .map_err(|e| e.to_string());
        }
        let text = resp.into_string().unwrap_or_default();
        last_error = format!("status {status}: {}", text.chars().take(200).collect::<String>());
        if !is_retryable_status(status) {
            return Err(last_error);
        }
    }
    Err(format!(
        "chunk download gave up after {MAX_CHUNK_ATTEMPTS} attempts ({last_error})"
    ))
}

/// Upload a local media file to an already-created Graph upload session, resuming
/// from `resume_from` (the byte offset the TS layer learned Graph already has, via a
/// `GET` on the session URL — see adapter.ts `queryUploadSession`). Reads the file
/// straight from disk in fixed chunks; never holds more than one chunk in memory
/// regardless of file size. Returns the final DriveItem id.
#[tauri::command]
pub async fn upload_media_chunked(
    app: AppHandle,
    rel: String,
    upload_url: String,
    resume_from: u64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || upload_blocking(&app, &rel, &upload_url, resume_from))
        .await
        .map_err(|e| e.to_string())?
}

fn upload_blocking(app: &AppHandle, rel: &str, upload_url: &str, resume_from: u64) -> Result<String, String> {
    let path = resolve(app, rel)?;
    let total = fs::metadata(&path).map_err(|e| e.to_string())?.len();
    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(resume_from)).map_err(|e| e.to_string())?;

    let agent = ureq::AgentBuilder::new().timeout(CHUNK_TIMEOUT).build();
    let mut sent = resume_from;
    let mut buf = vec![0u8; CHUNK_SIZE as usize];
    let mut last_body = String::new();

    while sent < total {
        let to_read = std::cmp::min(CHUNK_SIZE, total - sent) as usize;
        file.read_exact(&mut buf[..to_read]).map_err(|e| e.to_string())?;
        let end = sent + to_read as u64 - 1;
        last_body = put_chunk_with_retry(&agent, upload_url, &buf[..to_read], sent, end, total)?;
        sent += to_read as u64;
        let _ = app.emit(
            "media-upload-progress",
            TransferProgress { media_ref: rel, sent, total },
        );
    }

    #[derive(serde::Deserialize)]
    struct ItemId {
        id: Option<String>,
    }
    let item: ItemId = serde_json::from_str(&last_body)
        .map_err(|e| format!("bad final upload-session response: {e}"))?;
    item.id.ok_or_else(|| "upload session completed without an item id".into())
}

/// Download a media binary from Graph straight to disk via chunked Range GETs,
/// resuming from the size of a leftover `<rel>.part` file. Only renamed into place
/// once the full `expected_size` is confirmed on disk.
#[tauri::command]
pub async fn download_media_chunked(
    app: AppHandle,
    rel: String,
    url: String,
    token: String,
    expected_size: u64,
) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || download_blocking(&app, &rel, &url, &token, expected_size))
        .await
        .map_err(|e| e.to_string())?
}

fn download_blocking(
    app: &AppHandle,
    rel: &str,
    url: &str,
    token: &str,
    expected_size: u64,
) -> Result<u64, String> {
    let final_path = resolve(app, rel)?;
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let part = part_path_for(&final_path);

    let mut offset = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    // A stale/corrupt partial from an incompatible earlier attempt — start over rather
    // than trying to resume past the end of what we're supposed to download.
    if expected_size > 0 && offset > expected_size {
        offset = 0;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&part)
        .map_err(|e| e.to_string())?;
    if offset == 0 {
        file.set_len(0).map_err(|e| e.to_string())?;
    }

    let agent = ureq::AgentBuilder::new().timeout(CHUNK_TIMEOUT).build();
    while offset < expected_size {
        let end = std::cmp::min(offset + CHUNK_SIZE - 1, expected_size - 1);
        let bytes = get_chunk_with_retry(&agent, url, token, offset, end)?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        offset += bytes.len() as u64;
        let _ = app.emit(
            "media-download-progress",
            TransferProgress { media_ref: rel, sent: offset, total: expected_size },
        );
    }
    drop(file);

    let got = fs::metadata(&part).map_err(|e| e.to_string())?.len();
    if expected_size > 0 && got != expected_size {
        return Err(format!("downloaded {got} bytes, expected {expected_size}"));
    }
    fs::rename(&part, &final_path).map_err(|e| e.to_string())?;
    Ok(got)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_range_formats_the_graph_header() {
        assert_eq!(content_range(0, 9, 100), "bytes 0-9/100");
        assert_eq!(content_range(10485760, 20971519, 52428800), "bytes 10485760-20971519/52428800");
    }

    #[test]
    fn retryable_status_is_429_or_5xx_only() {
        assert!(is_retryable_status(429));
        assert!(is_retryable_status(500));
        assert!(is_retryable_status(503));
        assert!(!is_retryable_status(400));
        assert!(!is_retryable_status(401));
        assert!(!is_retryable_status(404));
        assert!(!is_retryable_status(416)); // bad range — won't fix itself on retry
    }

    #[test]
    fn part_path_appends_dot_part_to_the_whole_filename() {
        assert_eq!(part_path_for(Path::new("/vault/media/n/pic.png")), Path::new("/vault/media/n/pic.png.part"));
        assert_eq!(part_path_for(Path::new("clip.m4a")), Path::new("clip.m4a.part"));
    }
}
