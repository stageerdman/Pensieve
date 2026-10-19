// Native transcription: shell out to the ported MLX engine (Python) and capture its
// stdout (our locked Transcript JSON). Progress lines on the child's stderr are
// forwarded to the webview as `transcribe-progress` events as they arrive.
//
// Packaging note (single-user owner, for now): the Python interpreter + engine script
// are passed in from the frontend (which holds the configured paths), so this stays
// generic and we avoid hardcoding the transcriber venv here. Bundling a self-contained
// runtime into the .app is a later packaging pass.
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, serde::Serialize)]
struct Progress {
    #[serde(rename = "mediaRef")]
    media_ref: String,
    phase: String,
    pct: f64,
}

/// Returned (as the invoke rejection) when a running job was cancelled by the user via
/// `cancel_transcription` — the frontend treats this as "paused", NOT a failure, and keeps
/// the checkpoint so Run resumes mid-file. Kept in sync with the frontend constant.
pub const CANCELLED: &str = "__cancelled__";

/// Registry of in-flight transcription children so a Pause can actually stop one. Keyed by
/// media ref: the live child PID, plus the set of refs the user asked to cancel (the signal
/// the worker checks after the child exits to report CANCELLED instead of an error).
struct Registry {
    pids: HashMap<String, u32>,
    cancelled: HashSet<String>,
}
fn registry() -> &'static Mutex<Registry> {
    static REG: OnceLock<Mutex<Registry>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(Registry { pids: HashMap::new(), cancelled: HashSet::new() }))
}

/// Cancel the running transcription for `media_ref` (the Pause button). Kills the engine
/// child if present; its czech-whisper checkpoint is left on disk so the next run resumes.
#[tauri::command]
pub fn cancel_transcription(media_ref: String) -> Result<(), String> {
    let pid = {
        let mut reg = registry().lock().map_err(|e| e.to_string())?;
        match reg.pids.get(&media_ref).copied() {
            Some(pid) => {
                reg.cancelled.insert(media_ref.clone());
                Some(pid)
            }
            None => None, // nothing running for this ref — a no-op
        }
    };
    if let Some(pid) = pid {
        // SIGKILL the engine. Any short-lived `claude -p` child it spawned during polish is
        // orphaned and exits on its own; MLX work is in-process, so this stops it outright.
        let _ = Command::new("kill").arg("-9").arg(pid.to_string()).status();
    }
    Ok(())
}

/// `<appData>/transcription/<sanitized media ref>.partial.json` — the czech-whisper resume
/// checkpoint. Lives outside the vault so it never pollutes the note store or OneDrive sync.
fn checkpoint_path(app: &AppHandle, media_ref: &str) -> Option<String> {
    let dir = app.path().app_data_dir().ok()?.join("transcription");
    let _ = std::fs::create_dir_all(&dir);
    let safe = media_ref.replace(['/', '\\'], "_");
    Some(dir.join(format!("{safe}.partial.json")).to_string_lossy().to_string())
}

fn vault_audio_path(app: &AppHandle, media_ref: &str) -> Result<std::path::PathBuf, String> {
    // Same traversal guard as the fs commands: a vault-relative ref may not escape.
    if media_ref.contains("..") || media_ref.starts_with('/') {
        return Err("invalid media ref".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("vault").join(media_ref))
}

/// The Python interpreter to run the engine with. Packaging is deferred, so (for now) this
/// is the transcriber's MLX venv: overridable via $PENSIEVE_PYTHON, else the known path.
fn resolve_python(explicit: Option<String>) -> String {
    if let Some(p) = explicit.filter(|s| !s.is_empty()) {
        return p;
    }
    if let Ok(p) = std::env::var("PENSIEVE_PYTHON") {
        if !p.is_empty() {
            return p;
        }
    }
    "/Users/stage/dev/transcriber/.venv/bin/python".to_string()
}

/// The engine script path: the frontend value if given, else the bundled resource
/// (`<resources>/engine/pensieve_transcribe.py`), else the in-repo dev path.
fn resolve_engine(app: &AppHandle, explicit: Option<String>) -> String {
    if let Some(p) = explicit.filter(|s| !s.is_empty()) {
        return p;
    }
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("engine/pensieve_transcribe.py");
        if bundled.exists() {
            return bundled.to_string_lossy().to_string();
        }
    }
    // dev fallback: alongside the Cargo manifest
    let dev = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("engine/pensieve_transcribe.py");
    dev.to_string_lossy().to_string()
}

/// Transcribe one audio file. Returns the raw Transcript JSON (stdout) on success.
/// Emits `transcribe-progress` {mediaRef, phase, pct} as the engine reports.
#[tauri::command]
pub async fn transcribe_audio(
    app: AppHandle,
    media_ref: String,
    model: String,
    python_path: Option<String>,
    engine_path: Option<String>,
    polish: Option<bool>,
) -> Result<String, String> {
    if model != "czech-whisper" && model != "parakeet" {
        return Err(format!("unknown model: {model}"));
    }
    let audio = vault_audio_path(&app, &media_ref)?;
    if !audio.exists() {
        return Err(format!("audio not found: {}", audio.display()));
    }
    let audio_str = audio.to_string_lossy().to_string();
    let python_path = resolve_python(python_path);
    let engine_path = resolve_engine(&app, engine_path);
    let ref_for_thread = media_ref.clone();
    // czech-whisper checkpoints for mid-file resume; parakeet is single-shot (no checkpoint).
    let checkpoint = if model == "czech-whisper" { checkpoint_path(&app, &media_ref) } else { None };

    // A fresh run for this ref supersedes any earlier cancel request still on the books.
    if let Ok(mut reg) = registry().lock() {
        reg.cancelled.remove(&media_ref);
    }

    // spawn_blocking: child process + line-reading loop are blocking work.
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(&python_path);
        cmd.arg(&engine_path)
            .arg("--audio")
            .arg(&audio_str)
            .arg("--model")
            .arg(&model)
            .arg("--media-ref")
            .arg(&ref_for_thread);
        if let Some(ref cp) = checkpoint {
            cmd.arg("--checkpoint").arg(cp);
        }
        if polish.unwrap_or(false) {
            cmd.arg("--polish");
        }
        // A Finder-launched .app inherits a minimal PATH (no /opt/homebrew/bin), so the
        // engine's `ffmpeg` (audio decode) and `claude` (polish) lookups fail. Put the
        // common Homebrew/local bins on the child's PATH so they're found.
        let base_path = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{base_path}"));
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;
        // Register the PID so a Pause (cancel_transcription) can kill this child.
        if let Ok(mut reg) = registry().lock() {
            reg.pids.insert(ref_for_thread.clone(), child.id());
        }
        let stdout = child.stdout.take().ok_or("no stdout pipe")?;
        let stderr = child.stderr.take().ok_or("no stderr pipe")?;

        // Drain stderr on its own thread (emit progress + keep the tail for errors)
        // while the main thread drains stdout — reading both concurrently avoids a
        // pipe-buffer deadlock when a long transcript's stdout is larger than 64 KB.
        let app2 = app.clone();
        let ref2 = ref_for_thread.clone();
        let err_thread = std::thread::spawn(move || {
            let mut tail = String::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let t = line.trim();
                if t.starts_with('{') {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(t) {
                        if let (Some(phase), Some(pct)) = (v.get("phase"), v.get("pct")) {
                            let _ = app2.emit(
                                "transcribe-progress",
                                Progress {
                                    media_ref: ref2.clone(),
                                    phase: phase.as_str().unwrap_or("").to_string(),
                                    pct: pct.as_f64().unwrap_or(0.0),
                                },
                            );
                        }
                    }
                }
                tail.push_str(&line);
                tail.push('\n');
                if tail.len() > 4000 {
                    tail = tail.split_off(tail.len() - 2000);
                }
            }
            tail
        });

        let mut json = String::new();
        BufReader::new(stdout)
            .read_to_string(&mut json)
            .map_err(|e| e.to_string())?;
        let stderr_tail = err_thread.join().unwrap_or_default();
        let status = child.wait().map_err(|e| e.to_string())?;

        // Deregister this child; learn whether the exit was a user cancel.
        let was_cancelled = match registry().lock() {
            Ok(mut reg) => {
                reg.pids.remove(&ref_for_thread);
                reg.cancelled.remove(&ref_for_thread)
            }
            Err(_) => false,
        };
        if was_cancelled {
            // Paused by the user — not a failure. The checkpoint stays on disk for resume.
            return Err(CANCELLED.into());
        }

        let json = json.trim().to_string();
        // The engine writes the whole transcript to stdout in one shot at the very END
        // (a single json.dump). So non-empty stdout means it ran to completion — trust it
        // and let the frontend's parseTranscript be the final validator — EVEN IF the exit
        // status is non-zero: a teardown-only failure (classically Python exit 120 while
        // flushing streams at shutdown) must not discard an already-complete transcript.
        if !json.is_empty() {
            return Ok(json);
        }
        if !status.success() {
            return Err(format!("engine exited with {status}: {stderr_tail}"));
        }
        Err("engine produced no output".into())
    })
    .await
    .map_err(|e| e.to_string())?
}
