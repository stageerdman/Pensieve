// Pensieve native shell. The vault lives on disk under the app data dir; these
// commands are the filesystem layer the TS Tauri store adapter calls. Notes are
// plain .md files (the source of truth) with small .json sidecars for metadata
// and the addition timeline.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::fs;
use std::path::PathBuf;
use tauri::menu::{Menu, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};

mod sync;

fn vault_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("vault"))
}

/// The single path-traversal guard: a vault-relative path may not escape the vault.
/// Pulled out as a pure function so it can be unit-tested without an AppHandle.
fn is_safe_rel(rel: &str) -> bool {
    !(rel.contains("..") || rel.starts_with('/'))
}

fn resolve(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    // Keep everything inside the vault — no path traversal.
    if !is_safe_rel(rel) {
        return Err("invalid path".into());
    }
    Ok(vault_root(app)?.join(rel))
}

#[tauri::command]
fn read_text(app: AppHandle, rel: String) -> Result<Option<String>, String> {
    let p = resolve(&app, &rel)?;
    match fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn write_text(app: AppHandle, rel: String, contents: String) -> Result<(), String> {
    let p = resolve(&app, &rel)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&p, contents).map_err(|e| e.to_string())
}

// Binary writes. `data` is base64 (not a Vec<u8> param): a JS number array over the invoke
// bridge is slow for image-sized payloads, so the JS side base64-encodes and we decode here.
// Mirrors write_text otherwise (reuses resolve, creates the parent dir).
#[tauri::command]
fn write_bytes(app: AppHandle, rel: String, data: String) -> Result<(), String> {
    let p = resolve(&app, &rel)?;
    let bytes = STANDARD.decode(data.as_bytes()).map_err(|e| e.to_string())?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&p, bytes).map_err(|e| e.to_string())
}

// Binary read, returning base64 (None on NotFound). Used by the OneDrive binary-backup
// phase later; symmetric with read_text.
#[tauri::command]
fn read_bytes(app: AppHandle, rel: String) -> Result<Option<String>, String> {
    let p = resolve(&app, &rel)?;
    match fs::read(&p) {
        Ok(b) => Ok(Some(STANDARD.encode(b))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn list_dir(app: AppHandle, rel: String) -> Result<Vec<String>, String> {
    let p = resolve(&app, &rel)?;
    let mut out = vec![];
    match fs::read_dir(&p) {
        Ok(rd) => {
            for entry in rd.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    out.push(name.to_string());
                }
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.to_string()),
    }
    Ok(out)
}

#[tauri::command]
fn remove_path(app: AppHandle, rel: String) -> Result<(), String> {
    let p = resolve(&app, &rel)?;
    match fs::remove_file(&p) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// The theme lives in the native menu bar (macOS), not in the app chrome. The
// Appearance submenu emits a `set-theme` event the webview listens for (useTheme).
fn build_menu(handle: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::default(handle)?;
    let appearance = SubmenuBuilder::new(handle, "Appearance")
        .text("theme-light", "Light")
        .text("theme-dark", "Dark")
        .text("theme-system", "System")
        .separator()
        .text("font-small", "Text Size: Small")
        .text("font-default", "Text Size: Default")
        .text("font-large", "Text Size: Large")
        .text("font-larger", "Text Size: Larger")
        .build()?;
    menu.append(&appearance)?;
    Ok(menu)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .menu(build_menu)
        .on_menu_event(|app, event| {
            match event.id().0.as_str() {
                "theme-light" => { let _ = app.emit("set-theme", "light"); }
                "theme-dark" => { let _ = app.emit("set-theme", "dark"); }
                "theme-system" => { let _ = app.emit("set-theme", "system"); }
                "font-small" => { let _ = app.emit("set-font-scale", "0.9"); }
                "font-default" => { let _ = app.emit("set-font-scale", "1"); }
                "font-large" => { let _ = app.emit("set-font-scale", "1.15"); }
                "font-larger" => { let _ = app.emit("set-font-scale", "1.3"); }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            write_bytes,
            read_bytes,
            list_dir,
            remove_path,
            sync::secret_get,
            sync::secret_set,
            sync::secret_delete,
            sync::open_url,
            sync::oauth_listen,
            sync::port_available,
            sync::http_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guard_rejects_traversal() {
        assert!(!is_safe_rel("../etc/passwd")); // parent escape
        assert!(!is_safe_rel("media/foo/../../x")); // embedded ..
        assert!(!is_safe_rel("/absolute/path")); // absolute
        assert!(is_safe_rel("media/note1/abc.png")); // ordinary media ref
        assert!(is_safe_rel("notes/abc.md"));
    }

    #[test]
    fn base64_round_trips_bytes() {
        // The write_bytes/read_bytes contract: bytes -> base64 -> bytes is lossless,
        // including non-UTF8 binary.
        let bytes: Vec<u8> = vec![0, 1, 2, 137, 80, 78, 71, 255, 128, 64];
        let encoded = STANDARD.encode(&bytes);
        let decoded = STANDARD.decode(encoded.as_bytes()).unwrap();
        assert_eq!(bytes, decoded);
    }
}
