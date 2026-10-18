// Pensieve native shell. The vault lives on disk under the app data dir; these
// commands are the filesystem layer the TS Tauri store adapter calls. Notes are
// plain .md files (the source of truth) with small .json sidecars for metadata
// and the addition timeline.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::fs;
use std::path::PathBuf;
use tauri::menu::{Menu, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

mod sync;
mod transcribe;

// Flip between a normal app (dock icon + the Appearance menu) and a pure menu-bar
// "accessory" (no dock icon, no app menu) depending on whether a window is on screen.
#[cfg(target_os = "macos")]
fn set_policy(app: &AppHandle, visible: bool) {
    let policy = if visible {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    };
    let _ = app.set_activation_policy(policy);
}
#[cfg(not(target_os = "macos"))]
fn set_policy(_app: &AppHandle, _visible: bool) {}

// Bring the main window to the front (switching Pensieve back to a normal, dock-visible
// app), then optionally tell the webview what to do once it's there (`new-note` / `summon`).
// The intent rides the same emit→listen bridge as the theme/font-scale menu.
fn reveal(app: &AppHandle, intent: Option<&str>) {
    set_policy(app, true);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
    if let Some(event) = intent {
        let _ = app.emit(event, ());
    }
}

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
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();
    // The global-shortcut plugin must be registered before `app.global_shortcut()` is
    // used in setup. Desktop-only.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }
    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // A manual launch (Spotlight / Finder / dock) is an explicit "open Pensieve",
            // so show the window (it's created hidden via `visible: false`). Closing it
            // later (red button / ⌘W) is what hides Pensieve back into the menu bar.
            reveal(app.handle(), None);

            // Tray icon + global shortcuts are desktop-only (the future iPhone app is
            // capture-only and builds without them).
            #[cfg(desktop)]
            {
                use tauri::menu::{MenuBuilder, MenuItem};
                use tauri::tray::TrayIconBuilder;

                // The status-bar icon and its menu (New memory / Accio / — / Quit).
                // Clicking the icon drops the menu; each item reveals the window and emits
                // its intent, except Quit which is the only real exit.
                let new_item = MenuItem::with_id(app, "tray-new", "New memory", true, None::<&str>)?;
                let accio_item = MenuItem::with_id(app, "tray-accio", "Accio", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "tray-quit", "Quit Pensieve", true, None::<&str>)?;
                let tray_menu = MenuBuilder::new(app)
                    .item(&new_item)
                    .item(&accio_item)
                    .separator()
                    .item(&quit_item)
                    .build()?;
                // The menu-bar glyph is the inner sigil only (no tile) as a monochrome
                // *template* image — macOS tints it white on the dark bar / black on light,
                // so it sits with the other system icons. Source: icons/tray.png.
                let _tray = TrayIconBuilder::with_id("pensieve-tray")
                    .icon(tauri::include_image!("icons/tray.png"))
                    .icon_as_template(true)
                    .tooltip("Pensieve")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(true)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "tray-new" => reveal(app, Some("new-note")),
                        "tray-accio" => reveal(app, Some("summon")),
                        "tray-quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)?;

                // Global hotkeys (fire even when Pensieve isn't focused):
                //   ⌘⇧N → new memory,  ⌘⇧A → Accio. Both reveal the window + emit intent.
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
                let new_sc = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN);
                let accio_sc = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyA);
                let gs = app.global_shortcut();
                gs.on_shortcut(new_sc, |app, _sc, event| {
                    if event.state() == ShortcutState::Pressed {
                        reveal(app, Some("new-note"));
                    }
                })?;
                gs.on_shortcut(accio_sc, |app, _sc, event| {
                    if event.state() == ShortcutState::Pressed {
                        reveal(app, Some("summon"));
                    }
                })?;
            }

            Ok(())
        })
        // Close (red button / ⌘W) hides to the menu bar instead of quitting; only the
        // tray's Quit exits. Dropping the last visible window flips back to accessory.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                set_policy(window.app_handle(), false);
            }
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
            sync::http_request,
            transcribe::transcribe_audio
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            // Clicking Pensieve's dock icon or relaunching it via Spotlight/Finder while it's
            // already running (window hidden in the bar) fires Reopen — bring the window back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                reveal(_app, None);
            }
        });
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
