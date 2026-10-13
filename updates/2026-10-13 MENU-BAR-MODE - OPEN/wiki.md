# MENU-BAR-MODE — durable decisions & lessons

## Why the Rust shell owns everything
Tauri v2 permissions (capabilities) gate commands invoked **from JS**. Window show/hide/
focus, the tray icon, its menu, activation-policy changes, and global-shortcut registration
are all done **in Rust**, which bypasses the ACL. So `capabilities/default.json` needs no
new entries. The webview only uses the already-permitted event `listen` channel.

## Dynamic activation policy
`Accessory` = no dock icon, no app menu bar (pure status-bar app). `Regular` = normal app.
We flip to `Regular` when a window becomes visible and back to `Accessory` when the last
window hides. This keeps the existing macOS "Appearance" menu (theme/text-size) reachable
while working, without leaving a dock icon when Pensieve is parked in the bar.

## Event bridge
Established pattern (useTheme/useFontScale): Rust `app.emit("name", payload)` → webview
`listen("name")`. Reused verbatim for `new-note` and `summon`. Idempotency matters: a
focused global shortcut can fire BOTH the OS hotkey (→ emit) and the in-app keydown, so the
frontend actions must be safe to call twice. `summonSearch` already is. `newNote` is not, so
we split the keys: in-app ⌘N requires NO shift; ⌘⇧N belongs solely to the global handler.

## Open follow-ups
- Monochrome **template** tray icon (`Image` + `as_template(true)`) so the menu-bar glyph
  adapts to light/dark menu bars. v1 ships the full-color app icon.
- Optional: "Open at Login" via `tauri-plugin-autostart` so the bar icon is always there.
