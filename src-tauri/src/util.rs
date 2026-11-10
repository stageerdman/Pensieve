use std::path::Path;

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
