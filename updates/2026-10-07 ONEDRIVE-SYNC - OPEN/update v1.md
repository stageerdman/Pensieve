# ONEDRIVE-SYNC — update v1

## Goal
Build the **sync spine**: a OneDrive-backed layer that lets the Pensieve vault
(`.md` notes + media) live in the cloud so multiple devices (desktop now, iPhone
later) read and write the same source of truth. OneDrive is dumb transport; our
code owns merging/editing. This update is the **desktop (Tauri) side** of that
spine. The PWA capture app is a separate update ([[../2026-10-07 PWA-CAPTURE - OPEN/update v1]]).

### The agreed model (deliberately simple for v1)
- **OneDrive = cloud mirror of the vault.** One folder (e.g. `/Apps/Pensieve/`
  or `/Pensieve/`) holds the same `.md` + media tree as local disk.
- **Single-writer discipline, enforced not trusted.** You edit from one device at
  a time. You must sync before and after editing. Without a fresh sync you can't
  edit. We don't do real CRDT merging yet.
- **Conflicts are *detected*, never silently lost.** Every file carries an eTag;
  writes are conditional (`If-Match`). If the remote changed since our last sync,
  the write is rejected and we surface "edited elsewhere — re-sync first" instead
  of clobbering.
- **New-capture-per-file is collision-free by design.** Each capture is a new
  file with a unique id; two devices creating notes never fight. The only real
  conflict is editing the *same existing note*, which the single-writer rule covers.
- **Online-only is acceptable for v1.** No offline queue yet.

## Non-goals (v1)
- No automatic merge / CRDT. No multi-device simultaneous editing.
- No media sync yet beyond proving the path works (text `.md` is the focus).
- No background daemon syncing with the app closed.

## Key risk to retire first
Whether a **pure public-client PKCE flow (no client secret)** works for personal
Microsoft accounts. The sibling `onedrive-manager` app hit `AADSTS70002` and fell
back to a confidential "Web" app **with a secret** — fine for a server app, but a
PWA/mobile client *cannot hold a secret*. Likely fix: register an **SPA** platform
redirect (not "Web") on the same Azure app, which enables auth-code+PKCE+CORS with
no secret. The desktop (Tauri) side can use a loopback/native redirect. **The spike
must confirm the secret-less path**, because the whole free-PWA story depends on it.

## Phased roadmap
- **Phase 0 — Research spike** *(in progress)*. Throwaway Node script in `spike/`,
  reusing `onedrive-manager`'s Azure app + stored refresh token. Prove end-to-end:
  refresh → access token; create isolated `/Pensieve-Spike/` folder; upload a fake
  `.md`; read it back; conditional update with `If-Match` (success → new eTag);
  stale `If-Match` (expect 412 = conflict detected); `/delta` cursor returns only
  changes. Findings → `wiki.md`.
- **Phase 1 — Auth + token storage (Tauri).** OAuth against Microsoft from the
  native app (loopback redirect or device-code), refresh token in the OS keychain.
  Reuse the proven flow from the spike.
- **Phase 2 — Remote adapter.** `lib/backup` (or `lib/sync`) OneDrive adapter:
  list / upload / download / delete `.md` under the Pensieve app folder, with the
  retry/429 handling pattern from `onedrive-manager`'s `graphFetch`.
- **Phase 3 — Delta pull.** Cursor-based change detection (`/delta`); apply remote
  changes into the local vault + SQLite index; persist the delta cursor.
- **Phase 4 — Push + single-writer guard.** Conditional writes (`If-Match` eTag),
  a lightweight lock/owner marker, and the "must sync before edit" gate wired into
  the editor. Reject + surface conflicts.
- **Phase 5 — Status UI, edge cases, tests.** Sync status surface, reconnect flow,
  tests locking the conflict/delta logic. Verify by running the real app.

## Live status
- 2026-10-07: Update opened. **Phase 0 spike DONE ✅** — ran against the real Stage
  Erdman OneDrive. All primitives proven: refresh→token, folder create, `.md`
  upload, byte-exact read-back, `If-Match` conditional write (200 + cTag bump),
  **stale `If-Match` → 412 (conflict detected, no silent clobber)**, and `/delta`
  incremental cursor. See `wiki.md` for details. Phase 1 (Tauri auth) is unblocked.
  **One open item:** confirm the PWA's secret-less PKCE login via an **SPA**
  redirect on the Azure app (portal change + a browser login; blocks PWA-CAPTURE
  Phase 1, not this update).
- Next: Phase 1 — Tauri OAuth + keychain token storage.

### ▶ Resume here (next session)
Phase 0 is done and the whole sync model is proven. Two independent tracks to pick
up from:
1. **ONEDRIVE-SYNC Phase 1 (unblocked, code).** Build Tauri OAuth + OS-keychain
   refresh-token storage, reusing the flow proven in `spike/spike.mjs` and the
   patterns in `onedrive-manager/lib/graph/`. Then Phase 2 remote adapter.
2. **PWA-CAPTURE unblocker (config, do first if touching the phone app).** In the
   Azure portal, add an **SPA** platform redirect to the shared app registration,
   then confirm a secret-less browser PKCE login → Graph call. This is the only
   thing blocking PWA-CAPTURE Phase 1.
Reusable facts (Azure app, account id, token crypto, cTag/`If-Match`, `/delta`)
are in `wiki.md` and in the `onedrive-sync-infra` memory. Spike artifacts live in
`/Pensieve-Spike/` on the Stage Erdman drive — deletable anytime.

## Decisions
- Reuse `onedrive-manager`'s Azure app registration + scopes (`Files.ReadWrite
  offline_access`) rather than registering a new app — one app, many redirects.
- Isolate all spike activity under a dedicated `/Pensieve-Spike/` OneDrive folder
  so nothing touches real data.
