# MENU-BAR-MODE — Pensieve lives in the macOS menu bar

## Goal
Turn Pensieve into a lightweight macOS menu-bar app:
- A Pensieve icon sits in the top (status) bar. Clicking it opens a menu:
  **New memory**, **Accio**, **Quit**.
- **⌘⇧N** (global) → show the window on a fresh new memory.
- **⌘⇧A** (global) → show the window with Accio (the Summon search) focused.
- Closing the window (red button / ⌘W) **hides to the bar** — does not quit. Only
  **Quit** exits.
- **Bar-only at launch**: starts silent in the menu bar, window hidden until summoned.

## Decisions (confirmed with owner)
- Close button → hide to bar (not quit).
- Launch → bar-only (window created hidden, no dock icon at rest).
- ⌘⇧N / ⌘⇧A → reuse the single `main` window, re-targeted to new-memory / Accio.
- Activation policy is **dynamic**: `Accessory` at rest (no dock icon, no app menu),
  `Regular` while a window is visible (dock icon + the existing Appearance menu come
  back). So working feels like a normal app; closed, it's just the bar icon.

## Architecture
- **Rust shell owns it** (no new frontend permissions needed — all window/tray/shortcut
  work is Rust-side; the webview only `listen`s for events, like `set-theme` today).
- Reuse the proven `app.emit(...)` → webview `listen(...)` bridge (useTheme/useFontScale).
  New events: `new-note`, `summon`.
- Frontend maps those events onto the EXISTING `newNote` (useTabs) and `summonSearch`
  (App.tsx) — no new note-creation / search logic.

## Phased roadmap
- **P1 — Tray + activation policy + hide-on-close.** Cargo dep stays; add `TrayIconBuilder`
  menu (New memory / Accio / — / Quit), `set_activation_policy`, window `visible:false`,
  `on_window_event` CloseRequested → prevent + hide + Accessory. Menu items show+focus the
  window (Regular) and emit `new-note` / `summon`; Quit → `app.exit(0)`.
- **P2 — Global shortcuts.** Add `tauri-plugin-global-shortcut`; register ⌘⇧N / ⌘⇧A with a
  Rust handler that shows+focuses the window and emits the same events.
- **P3 — Frontend wiring.** `listen("new-note")` → newNote, `listen("summon")` → summonSearch.
  Guard the in-app ⌘N with `!shift` so a focused ⌘⇧N doesn't double-create a note.
- **P4 — Build + verify + merge.** `npm run tauri:build`, confirm /Applications mod-time,
  owner device-test, merge to main, close folder.

## Status
- [x] P1  - [x] P2  - [x] P3  - [x] P4 (built + installed to /Applications)
- Smoke-verified: app launches bar-only, no window, process stays alive (setup — tray,
  shortcuts, accessory policy — doesn't panic).
- **Pending owner device test** (interactive, can't be driven headless): tray menu items,
  ⌘⇧N / ⌘⇧A, hide-on-close. Merge to `main` once confirmed.

## Notes / next
- Tray uses the default app icon for v1; a monochrome template icon is a nice follow-up
  (see wiki.md).

## Re-integration onto main (2026-10-16)
- **Root problem found:** this feature was fully built + owner-tested on branch
  `update/menu-bar-mode` but was **NEVER merged to main**. Main then advanced ~66 commits
  (MEDIA-IMAGES added the binary FS commands + `protocol-asset`; OneDrive; gallery), so every
  app the owner built from main lacked the menu-bar feature → "the tray icon is gone."
- A raw `git merge` would conflict hard (lib.rs / tauri.conf / capabilities / App.tsx all moved
  on both sides across the gap). So the 7 branch commits were **re-applied onto current main**
  by hand, preserving main's later work:
  - `Cargo.toml`: `tauri` features `["protocol-asset","tray-icon"]` (kept protocol-asset) +
    `tauri-plugin-global-shortcut = "2"`.
  - `capabilities/default.json`: `core:window:allow-close`.
  - `tauri.conf.json`: window `label:"main"` + `visible:false` (kept assetProtocol/dragDrop).
  - `lib.rs`: `set_policy`/`reveal`, the setup body (reveal-on-launch, tray, ⌘⇧N/⌘⇧A global
    shortcuts), `on_window_event` CloseRequested→hide+Accessory, and `.build().run(Reopen)` —
    grafted on top of main's binary-FS invoke_handler + Appearance menu.
  - TS: new `useNativeCommands.ts`; `App.tsx` wires it (newNote/summonSearch) + ⌘W-on-Home hides
    to the bar; `useGlobalShortcuts.ts` guards plain ⌘N with `!shiftKey`.
  - `icons/tray.png` copied over.
- Verified: `tsc` (main) clean, `cargo check` clean (global-shortcut plugin resolved), 752 JS
  tests pass. Native `tauri:build` → /Applications (verify mod-time). **Pending owner device
  re-test** of tray menu / global hotkeys / hide-to-bar on the freshly installed app.

## Closed (2026-10-23)
Owner confirmed tray menu / global hotkeys / hide-to-bar all work on the device. Folder closed.
