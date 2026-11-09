// A headless `claude -p` shell-out for describing one photographed journal page — the
// Phase 5 AI step of RAW-MEMORY-JOURNAL. Mirrors the already-shipped pattern in
// engine/pensieve_transcribe.py's `_run_claude` (same binary, same `-p` + stdin-prompt
// shape), not a new design: PATH is augmented the same way transcribe_audio already does
// (a Finder-launched .app inherits a minimal PATH, missing /opt/homebrew/bin), and the
// prompt goes in over stdin rather than argv (no shell-escaping, no argv length limit).
//
// The one real addition verified against the live CLI (not guessed): headless `-p` mode
// is sandboxed from reading arbitrary file paths by default — `claude -p` with a prompt
// that says "read /tmp/x" refuses with "I don't have permission to read that file" unless
// the file's directory is explicitly granted via `--add-dir`. So this command always adds
// the image's own parent directory, nothing wider.
//
// Deliberately NOT `--bare`: bare mode forces ANTHROPIC_API_KEY/apiKeyHelper auth and
// never reads the OAuth/keychain session — but Pensieve's whole AI design (CLAUDE.md) is
// "use the logged-in Claude account, no API key." Omitting --bare does mean this call's
// cwd's own CLAUDE.md gets auto-loaded; working_dir is set to the image's own folder
// (never the Pensieve repo root) specifically so nothing of THIS project's dev-workflow
// CLAUDE.md leaks into a page-description task.
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

#[tauri::command]
pub async fn describe_journal_page(image_path: String, prompt: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || describe_blocking(&image_path, &prompt))
        .await
        .map_err(|e| e.to_string())?
}

fn describe_blocking(image_path: &str, prompt: &str) -> Result<String, String> {
    let path = Path::new(image_path);
    if !path.exists() {
        return Err(format!("page image not found: {image_path}"));
    }
    let dir = path.parent().ok_or("page image has no parent directory")?;

    let mut cmd = Command::new("claude");
    cmd.arg("-p").arg("--add-dir").arg(dir).current_dir(dir);
    // Same PATH/env rationale as transcribe_audio (see transcribe.rs) — a Finder-launched
    // .app's minimal PATH otherwise can't find a Homebrew-installed `claude`.
    let base_path = std::env::var("PATH").unwrap_or_default();
    cmd.env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{base_path}"));
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("spawn failed (is `claude` installed?): {e}"))?;
    child
        .stdin
        .take()
        .ok_or("no stdin pipe")?
        .write_all(prompt.as_bytes())
        .map_err(|e| format!("failed to write prompt: {e}"))?;

    let output = child.wait_with_output().map_err(|e| format!("wait failed: {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() { format!("claude exited with {}", output.status) } else { err });
    }
    let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if out.is_empty() {
        return Err("claude returned no output".into());
    }
    Ok(out)
}
