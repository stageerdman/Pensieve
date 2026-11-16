//! Persistent half of the central logger (src/lib/logger.ts). The JS logger keeps a
//! bounded in-memory ring for in-app queries; this appends the same entries, as JSON
//! lines, to `~/Library/Logs/xyz.erdman.pensieve/ui.jsonl` so what happened in the
//! background survives a quit and can be queried from outside the app
//! (`npm run logs -- --module sync`). Capped: at MAX_BYTES the file rotates to
//! `ui.1.jsonl` (one generation kept), so disk use is bounded at ~2×MAX_BYTES.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 5 * 1024 * 1024;
const FILE: &str = "ui.jsonl";
const ROTATED: &str = "ui.1.jsonl";

fn log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_log_dir().map_err(|e| e.to_string())
}

/// Append pre-serialized JSON lines, rotating first if the file is over the cap.
pub(crate) fn append_lines(dir: &Path, lines: &[String]) -> Result<(), String> {
    if lines.is_empty() {
        return Ok(());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(FILE);
    if fs::metadata(&path).map(|m| m.len() >= MAX_BYTES).unwrap_or(false) {
        let _ = fs::rename(&path, dir.join(ROTATED));
    }
    let mut f = OpenOptions::new().create(true).append(true).open(&path).map_err(|e| e.to_string())?;
    let mut buf = String::new();
    for l in lines {
        // One entry per line, always — a stray newline would split a record.
        buf.push_str(&l.replace('\n', "\\n"));
        buf.push('\n');
    }
    f.write_all(buf.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn append_log(app: AppHandle, lines: Vec<String>) -> Result<(), String> {
    append_lines(&log_dir(&app)?, &lines)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_one_line_per_entry_and_rotates_at_cap() {
        let dir = std::env::temp_dir().join(format!("pensieve-log-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        append_lines(&dir, &["{\"a\":1}".into(), "{\"b\":\"x\ny\"}".into()]).unwrap();
        let text = fs::read_to_string(dir.join(FILE)).unwrap();
        assert_eq!(text.lines().count(), 2);

        // Over the cap → the next append rotates the old file out first.
        fs::write(dir.join(FILE), vec![b'x'; MAX_BYTES as usize]).unwrap();
        append_lines(&dir, &["{\"c\":1}".into()]).unwrap();
        assert_eq!(fs::read_to_string(dir.join(FILE)).unwrap(), "{\"c\":1}\n");
        assert!(dir.join(ROTATED).exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
