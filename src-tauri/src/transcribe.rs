// Native transcription: shell out to the ported MLX engine (Python) and capture its
// stdout (our locked Transcript JSON). Progress lines on the child's stderr are
// forwarded to the webview as `transcribe-progress` events as they arrive.
//
// Packaging note (single-user owner, for now): the Python interpreter + engine script
// are passed in from the frontend (which holds the configured paths), so this stays
// generic and we avoid hardcoding the transcriber venv here. Bundling a self-contained
// runtime into the .app is a later packaging pass.
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{BufRead, BufReader, Read};
use std::os::unix::process::ExitStatusExt;
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

/// Append `line` to a bounded tail of recent stderr lines, dropping the oldest while the
/// total byte size exceeds `cap` (always keeping at least one line). Whole-line bookkeeping
/// — never a byte-offset String slice — so multi-byte UTF-8 (e.g. tqdm's `█`) can't trigger
/// the `split_off`-on-non-char-boundary panic that used to kill the reader thread and cascade
/// into a bogus engine exit 120.
fn push_bounded(recent: &mut VecDeque<String>, tail_bytes: &mut usize, line: String, cap: usize) {
    *tail_bytes += line.len() + 1;
    recent.push_back(line);
    while *tail_bytes > cap && recent.len() > 1 {
        if let Some(dropped) = recent.pop_front() {
            *tail_bytes -= dropped.len() + 1;
        }
    }
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

/// `<appData>/transcription/` — holds the resume checkpoints and the debug log, outside the
/// vault so they never pollute the note store or OneDrive sync. Returns the created dir.
fn transcription_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("transcription");
    let _ = std::fs::create_dir_all(&dir);
    Some(dir)
}

/// `<appData>/transcription/<sanitized media ref>.partial.json` — the czech-whisper resume
/// checkpoint.
fn checkpoint_path(app: &AppHandle, media_ref: &str) -> Option<String> {
    let safe = media_ref.replace(['/', '\\'], "_");
    Some(transcription_dir(app)?.join(format!("{safe}.partial.json")).to_string_lossy().to_string())
}

/// `<appData>/transcription/transcribe-debug.log` — the engine's step/env/crash log, on disk
/// so we have ground truth about a failure regardless of what the stdout/stderr pipes do.
fn debug_log_path(app: &AppHandle) -> Option<String> {
    Some(transcription_dir(app)?.join("transcribe-debug.log").to_string_lossy().to_string())
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
    let debug_log = debug_log_path(&app);

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
        if let Some(ref dl) = debug_log {
            cmd.arg("--debug-log").arg(dl);
        }
        if polish.unwrap_or(false) {
            cmd.arg("--polish");
        }
        // A Finder-launched .app inherits a minimal PATH (no /opt/homebrew/bin), so the
        // engine's `ffmpeg` (audio decode) and `claude` (polish) lookups fail. Put the
        // common Homebrew/local bins on the child's PATH so they're found.
        let base_path = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{base_path}"));
        // A Finder-launched .app also lacks a terminal's env. Set the few vars that matter for
        // a long Python/MLX run: unbuffered I/O + a native-fault traceback for diagnosis, an
        // explicit UTF-8 locale, and no tokenizer fork-thread churn.
        cmd.env("PYTHONUNBUFFERED", "1");
        cmd.env("PYTHONFAULTHANDLER", "1");
        cmd.env("LANG", "en_US.UTF-8");
        cmd.env("TOKENIZERS_PARALLELISM", "false");
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;
        let child_pid = child.id();
        // Register the PID so a Pause (cancel_transcription) can kill this child.
        if let Ok(mut reg) = registry().lock() {
            reg.pids.insert(ref_for_thread.clone(), child_pid);
        }
        // A czech-whisper job can run ~2 h; the app usually hides to the menu bar (an
        // unattended, dockless process), so hold off idle sleep for the child's lifetime —
        // otherwise sleep can invalidate the Metal/GPU context mid-run. Best-effort.
        let _ = Command::new("caffeinate").arg("-i").arg("-w").arg(child_pid.to_string()).spawn();
        let stdout = child.stdout.take().ok_or("no stdout pipe")?;
        let stderr = child.stderr.take().ok_or("no stderr pipe")?;

        // Drain stderr on its own thread (emit progress + keep the tail for errors)
        // while the main thread drains stdout — reading both concurrently avoids a
        // pipe-buffer deadlock when a long transcript's stdout is larger than 64 KB.
        let app2 = app.clone();
        let ref2 = ref_for_thread.clone();
        let err_thread = std::thread::spawn(move || {
            // Keep a bounded tail of recent stderr LINES. The previous version grew a String
            // and did `tail.split_off(tail.len() - 2000)` — which PANICS when that byte offset
            // lands inside a multi-byte char, exactly what tqdm's `█` (3-byte) progress bars
            // caused. That panic killed this thread, closed the child's stderr pipe, and made
            // the engine die with a bogus exit 120. Read raw BYTES + lossy-decode (so a stray
            // non-UTF-8 byte can't terminate the reader either) and bound the tail by line.
            let mut reader = BufReader::new(stderr);
            let mut recent: VecDeque<String> = VecDeque::new();
            let mut tail_bytes: usize = 0;
            let mut buf: Vec<u8> = Vec::new();
            loop {
                buf.clear();
                match reader.read_until(b'\n', &mut buf) {
                    Ok(0) => break,  // EOF
                    Ok(_) => {}
                    Err(_) => break, // reader error — stop, but never panic
                }
                let line = String::from_utf8_lossy(&buf).trim_end_matches(['\n', '\r']).to_string();
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
                push_bounded(&mut recent, &mut tail_bytes, line, 4000);
            }
            recent.into_iter().collect::<Vec<_>>().join("\n")
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
            let detail = match (status.code(), status.signal()) {
                (Some(code), _) => format!("exit code {code}"),
                (None, Some(sig)) => format!("killed by signal {sig}"),
                _ => "unknown exit".to_string(),
            };
            let tail = if stderr_tail.trim().is_empty() {
                "(no engine output — see transcribe-debug.log)".to_string()
            } else {
                stderr_tail
            };
            return Err(format!("engine failed ({detail}): {tail}"));
        }
        Err("engine produced no output".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    // The regression guard for the exit-120 bug: the OLD code did
    // `tail.split_off(tail.len() - 2000)`, which panics when that byte offset lands inside a
    // multi-byte char. Feed the bounded-tail helper a flood of 3-byte `█` lines (exactly what
    // mlx_whisper's tqdm bar emitted) across the truncation boundary and assert it never
    // panics and stays bounded.
    #[test]
    fn push_bounded_never_panics_on_multibyte_and_stays_bounded() {
        let mut recent: VecDeque<String> = VecDeque::new();
        let mut bytes = 0usize;
        for i in 0..1000 {
            // '█' is U+2588 = 3 bytes; a line whose byte length makes len-2000 fall mid-char.
            let line = format!("{}{}", "█".repeat(37), i);
            push_bounded(&mut recent, &mut bytes, line, 4000);
            assert!(bytes <= 4000 || recent.len() == 1);
        }
        // The retained tail joins back to valid UTF-8 (no mid-char slicing ever happened).
        let tail = recent.into_iter().collect::<Vec<_>>().join("\n");
        assert!(tail.contains('█'));
        assert!(tail.len() <= 4100);
    }

    #[test]
    fn push_bounded_keeps_at_least_one_oversize_line() {
        let mut recent: VecDeque<String> = VecDeque::new();
        let mut bytes = 0usize;
        push_bounded(&mut recent, &mut bytes, "x".repeat(10_000), 4000);
        assert_eq!(recent.len(), 1); // never drops the only line, even if it exceeds the cap
    }
}
