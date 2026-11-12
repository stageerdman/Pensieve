// A headless, text-only `claude -p` call for Forms (FORMS update): "here is a form + a
// transcript (or past memories) → answer JSON". Same shape as ai_vision.rs (logged-in Claude
// account, no API key; `claude` located via util::resolve_binary; prompt over stdin, never
// argv) with two additions that a text job needs and the page-describer lacked:
//   · a hard TIMEOUT — a stuck CLI must fail the Process row, not hang it forever;
//   · Rust-side logging of start/finish/failure (durations + sizes, never the content).
// cwd is a private temp folder, never the Pensieve repo, so this project's dev-workflow
// CLAUDE.md is never auto-loaded into a user's form.
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const TIMEOUT: Duration = Duration::from_secs(300);

#[tauri::command]
pub async fn ask_claude_text(prompt: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || ask_blocking(&prompt))
        .await
        .map_err(|e| e.to_string())?
}

fn ask_blocking(prompt: &str) -> Result<String, String> {
    let started = Instant::now();
    let dir = std::env::temp_dir().join("pensieve-ai");
    std::fs::create_dir_all(&dir).map_err(|e| format!("temp dir: {e}"))?;

    let binary = crate::util::resolve_binary("claude");
    let mut cmd = Command::new(&binary);
    cmd.arg("-p").current_dir(&dir);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    log::info!("ai_text: start (prompt {} bytes)", prompt.len());

    let mut child = cmd.spawn().map_err(|e| format!("spawn failed (is `claude` installed?): {e}"))?;
    child
        .stdin
        .take()
        .ok_or("no stdin pipe")?
        .write_all(prompt.as_bytes())
        .map_err(|e| format!("failed to write prompt: {e}"))?;

    // Drain stdout/stderr on their own threads (a full pipe would otherwise block the child
    // while we poll), and poll for exit so a hung CLI can be killed at TIMEOUT.
    let mut so = child.stdout.take().ok_or("no stdout pipe")?;
    let mut se = child.stderr.take().ok_or("no stderr pipe")?;
    let out_t = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = so.read_to_end(&mut b);
        b
    });
    let err_t = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = se.read_to_end(&mut b);
        b
    });
    let status = loop {
        match child.try_wait() {
            Ok(Some(st)) => break st,
            Ok(None) if started.elapsed() > TIMEOUT => {
                let _ = child.kill();
                log::warn!("ai_text: timed out after {:?}", started.elapsed());
                return Err(format!("Claude didn't answer within {} s", TIMEOUT.as_secs()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(200)),
            Err(e) => return Err(format!("wait failed: {e}")),
        }
    };
    let stdout = out_t.join().unwrap_or_default();
    let stderr = err_t.join().unwrap_or_default();
    if !status.success() {
        let err = String::from_utf8_lossy(&stderr).trim().to_string();
        log::warn!("ai_text: failed ({status}) after {:?}", started.elapsed());
        return Err(if err.is_empty() { format!("claude exited with {status}") } else { err });
    }
    let out = String::from_utf8_lossy(&stdout).trim().to_string();
    if out.is_empty() {
        return Err("claude returned no output".into());
    }
    log::info!("ai_text: done in {:?} ({} bytes)", started.elapsed(), out.len());
    Ok(out)
}
