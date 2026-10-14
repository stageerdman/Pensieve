// Pensieve native shell. The vault lives on disk under the app data dir; these
// commands are the filesystem layer the TS Tauri store adapter calls. Notes are
// plain .md files (the source of truth) with small .json sidecars for metadata
// and the addition timeline.

use std::fs;
use std::path::PathBuf;
use tauri::menu::{Menu, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

mod sync;

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

fn resolve(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    // Keep everything inside the vault — no path traversal.
    if rel.contains("..") || rel.starts_with('/') {
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

            // Park in the menu bar at launch: no dock icon, window stays hidden
            // (tauri.conf.json sets `visible: false`) until summoned.
            set_policy(app.handle(), false);

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
