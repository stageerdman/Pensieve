# DROP-KEYCHAIN

## Goal
Stop the macOS Keychain password prompt that appeared on **every** sign-in / launch of
the OneDrive sync. The owner should never have to approve keychain access even once, and
the approach must port to the future iPhone capture app (which has no desktop keychain).

## Why it happened
Secrets (the OneDrive refresh token + the Azure app config incl. client secret) were
stored via the Rust `keyring` crate = the macOS Keychain. macOS gates keychain-item reads
by the accessing binary's **code-signing identity**. A locally-built `.app`
(`npm run tauri:build`) is ad-hoc signed and its signature changes on every rebuild, so
the keychain item's ACL no longer trusts the reader → macOS prompts for the password on
every launch. There is no macOS signing config in `tauri.conf.json`, so this was
permanent.

## Fix
Replace the keychain backend with a **local JSON file** in the app-data dir.
- `src-tauri/src/sync.rs`: `secret_get/set/delete` now read/write
  `app_data_dir()/secrets.json` — a flat `{ key: value }` map, guarded by a mutex,
  `chmod 600` on unix. The file sits **beside** `vault/`, never inside it, so the refresh
  token is never swept into the OneDrive backup.
- `src-tauri/Cargo.toml`: dropped the `keyring` dependency entirely.
- Frontend unchanged in behaviour — it only ever talked to the `secret_get/set/delete`
  commands (string key → string value). Updated stale "keychain" wording in
  `src/lib/sync/native.ts` and `src/lib/sync/config.ts`.

No code signing, no OS keychain, no prompt. Same trust level as the notes themselves
(already plaintext `.md` on disk), and the same file approach works on any platform.

## Migration (owner's machine, one-time)
The old `azure-config` + `refresh-token` lived in the keychain and won't carry over.
`setup/seed-secrets.mjs` re-derives both from onedrive-manager (same source as the
original seed) and writes `secrets.json` directly — it reads nothing from the keychain,
so it never prompts. After it runs, the app is connected with zero interaction.
(The orphaned keychain items are harmless; left in place so reading them can't prompt.)

## Roadmap
- [x] Phase 1 — File-backed secret store in Rust; drop `keyring`; update wording. Typecheck
      + sync tests green.
- [ ] Phase 2 — Seed `secrets.json`, build the native app, owner confirms: sync works and
      NO keychain prompt on launch. Merge to main, close out.

## Status
- 2026-10-08: Phase 1 implemented. `tsc --noEmit` clean. Seed script written.
