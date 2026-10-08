# SYNC-CONNECT

## Goal
Fix the OneDrive connect experience:
1. **Off port 3000.** "Connect OneDrive" failed with "Port 3000 is in use…" because the
   seeded config pointed Pensieve at onedrive-manager's confidential app (redirect
   `localhost:3000`). Move to Pensieve's own public-client app on `localhost:8711`.
2. **Connect to the right OneDrive.** The seed had connected to the wrong account;
   clear it and let the owner pick the correct account interactively.
3. **"Summon Pensieve" safety check.** Connecting to a drive with no Pensieve folder
   must NOT silently create one. Show an attention status + a one-click "Summon Pensieve"
   that creates the folder and runs the first backup. No sync until summoned.

## What changed
### Port / account (Part A)
- `config.ts`: default `redirectUri` → `http://localhost:8711/callback` (was `:3000`).
  The real value still comes from the `azure-config` secret.
- `connect.ts`: generic port-in-use message (no onedrive-manager reference); comment
  no longer says "keychain".
- `setup/set-azure-config.mjs`: points Pensieve at its own app by writing `azure-config`
  into `secrets.json` (file store, not keychain) and clearing `refresh-token` so the next
  Connect is a fresh interactive sign-in. **Needs the Pensieve app client ID.**
- Already done live: removed the wrong account's `refresh-token` from `secrets.json`.

### Summon Pensieve (Part B)
- `adapter.ts`: split `ensureRoot` into `remoteRootExists` (GET → 200 true / 404 false /
  else throw) and `createRoot` (the POST). No more auto-create.
- `engine.ts`: `sync()` now throws `RemoteRootMissingError` if the root is missing
  (never auto-creates). `createEngine()` gains `summon()` = `createRoot` then `sync`.
- `types.ts`: new `RemoteRootMissingError`.
- `useSync.ts`: new `needs-summon` phase; `syncNow`/`summon` share one runner; the
  runner maps `RemoteRootMissingError` → `needs-summon`. Exposes `summon`.
- `SyncStatus.tsx`: `needs-summon` renders a warn dot + still glyph, title "Pensieve
  isn't here yet.", an explanation that nothing syncs until summoned, and a primary
  "Summon Pensieve" button. The footer still shows WHICH account, so a wrong pick is
  obvious (and "Sign out" lets them switch).

## Tests
- `adapter.test.ts`: `remoteRootExists` (200/404/throw), `createRoot` (POST shape, 409 ok).
- `engine.test.ts`: sync refuses + creates nothing when root missing; summon
  (createRoot→sync) backs up the first note. FakeDrive gained a `rootExists` flag + the
  create-folder POST handler.
- Full suite 304/304 green; `tsc --noEmit` clean.

## Roadmap
- [x] Phase 1 — Summon feature + port-default move + setup script. Tests + tsc green.
- [ ] Phase 2 — Owner provides the Pensieve app client ID → run `set-azure-config.mjs`,
      build the native app. Owner: Connect (no :3000 error) → pick the right OneDrive →
      sees "Summon Pensieve" → summons → first backup. Merge to main, close out.

## Status
- 2026-10-08: Phase 1 implemented and green. Awaiting the Pensieve app client ID to wire
  up port 8711 and verify end to end. (Account already cleared; app shows disconnected.)
