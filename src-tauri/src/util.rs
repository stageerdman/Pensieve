use std::fs;
use std::io::Write;
use std::path::Path;

/// Write a file so a crash can never leave it half-written: the bytes go to a hidden
/// sibling temp file, are flushed to disk, then renamed over the target (rename is atomic
/// on the same volume). Readers see the old file or the new one — never a torn one.
/// Parent folders are created. A leftover temp from a crash is harmless (dot-prefixed,
/// `.tmp` suffix — no listing in the app matches it) and is overwritten next time.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("path has no parent folder")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let name = path.file_name().and_then(|n| n.to_str()).ok_or("path has no file name")?;
    let tmp = parent.join(format!(".{name}.tmp"));
    let mut f = fs::File::create(&tmp).map_err(|e| format!("temp create {}: {e}", tmp.display()))?;
    f.write_all(bytes).map_err(|e| format!("temp write {}: {e}", tmp.display()))?;
    f.sync_all().map_err(|e| format!("temp sync {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("rename into {}: {e}", path.display()))
}

/// Copy a file with the same never-half-written guarantee as atomic_write.
pub fn atomic_copy(from: &Path, to: &Path) -> Result<(), String> {
    let bytes = fs::read(from).map_err(|e| format!("read {}: {e}", from.display()))?;
    atomic_write(to, &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("pensieve-atomic-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn atomic_write_creates_parents_and_leaves_no_temp() {
        let d = temp_dir("write");
        let p = d.join("notes/a.md");
        atomic_write(&p, b"hello").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "hello");
        assert!(!d.join("notes/.a.md.tmp").exists());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn atomic_write_replaces_and_ignores_a_stale_temp_from_a_crash() {
        let d = temp_dir("stale");
        let p = d.join("raw/x.json");
        atomic_write(&p, b"old").unwrap();
        fs::write(d.join("raw/.x.json.tmp"), b"torn half-wri").unwrap(); // a crash's leftover
        assert_eq!(fs::read_to_string(&p).unwrap(), "old"); // the target was never touched
        atomic_write(&p, b"new").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "new");
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn atomic_copy_copies_bytes() {
        let d = temp_dir("copy");
        atomic_write(&d.join("media/r/a.jpg"), &[1, 2, 3]).unwrap();
        atomic_copy(&d.join("media/r/a.jpg"), &d.join("snapshots/raw/r/a.jpg")).unwrap();
        assert_eq!(fs::read(d.join("snapshots/raw/r/a.jpg")).unwrap(), vec![1, 2, 3]);
        fs::remove_dir_all(&d).unwrap();
    }
}

// A GUI app launched from Finder/Spotlight (as the installed .app is) doesn't inherit the
// shell's PATH — Homebrew's /opt/homebrew/bin (Apple Silicon) or /usr/local/bin (Intel) is
// on PATH in a terminal but not here, so `Command::new(name)` alone fails with "No such
// file or directory" even though the binary is installed. Check the known Homebrew
// locations first; fall back to the bare name so this still works wherever PATH does carry
// it (e.g. `cargo check`/`tauri dev` run from a terminal). Shared by transcribe.rs
// (ffmpeg/ffprobe), ai_vision.rs, and assistant.rs (claude).
pub fn resolve_binary(name: &str) -> String {
    for prefix in ["/opt/homebrew/bin", "/usr/local/bin"] {
        let candidate = format!("{prefix}/{name}");
        if Path::new(&candidate).exists() {
            return candidate;
        }
    }
    name.to_string()
}
