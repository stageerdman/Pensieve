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
- 2026-10-07: **Phase 1 DONE ✅** — Tauri auth + keychain token storage. Rust
  `sync.rs` (keyring secret store, one-shot OAuth loopback, open-url) + the portable
  TS sync core (`config/oauth/native/tokens/connect`). Desktop reuses the existing
  Azure "Web" app via a confidential loopback flow — **no portal change needed**.
  Keychain seeded from onedrive-manager so it reads as connected now. `cargo check`
  + `tsc` clean. See `wiki.md` → Phase 1. Next: Phase 2 (remote adapter).
- 2026-10-07: **Phases 2–4 DONE ✅** — remote adapter (`graph.ts` + `adapter.ts`)
  and the sync engine (`vault.ts` + `engine.ts`): delta pull, conditional push, and
  **both-direction conflict detection** (both-changed notes are reported and left
  untouched). Verified 12/12 (adapter) + 9/9 (engine) against the LIVE drive, plus
  18 new unit tests; full suite 275/275, tsc clean. Change-detection is skew-proof
  (compares the note's own updatedAt, not the wall clock). See `wiki.md` → Phases 2 / 3&4.
- 2026-10-07: **Phase 5 DONE ✅ — update COMPLETE.** Sync status UI (`useSync` +
  `SyncStatus`): one quiet cloud icon in the header, popover with Sync now / Connect /
  Reconnect / Disconnect, conflict rows + "keep this device's version" resolve
  (`engine.resolveKeepLocal`). Synthesized from two parallel UX concepts. Full suite
  276/276, tsc + web build clean, native `.app` built to /Applications for owner
  testing. See `wiki.md` → Phase 5 for the owner test checklist.

## Follow-up — bug fixes + sync details panel (2026-10-08)
Owner testing surfaced two bugs and a feature request; built on branch
`update/onedrive-sync-details`.

- **Bug: "sign-in expired on every sync, even after signing in."** A zero-risk
  live diagnostic proved the stored refresh token refreshes fine (secret-less,
  HTTP 200) — so it was **never** an auth/Azure problem (no portal change, no
  app-switch, no account change needed). Two real defects: (1) `SyncStatus`
  hardcoded "Sign-in expired." for *every* error phase, so any Graph/network
  failure masqueraded as an expiry; (2) `tokens.ts` collapsed all failures into one
  reconnect error. Fixed: typed `TokenError`/`TransientSyncError`; `tokens.ts` now
  classifies invalid_grant → reconnect (the only true expiry) vs network/5xx →
  transient vs real config error → shown as itself; refresh is **single-flight**
  (no double-redeem of a rotating token) and a keychain-write hiccup no longer
  discards a valid access token. `useSync` carries `errorKind`; the UI shows honest
  copy + a fitting action (Reconnect vs Try again).
- **Bug: "when it works it looks like it's infinitely syncing."** The rune flowed
  on an infinite loop in the reminder (unsynced-changes) and offline (disconnected)
  states too — perpetual motion with nothing transferring. **Motion now means an
  active transfer and nothing else:** syncing flows; reminder = static gold S;
  offline = static red. (Reverses the earlier "moving red" rune commits.)
- **Feature: the sync details panel.** A magical-UX expert designed it; built to
  spec. Clicking the rune unfolds a 280px panel: status → live transfer (a memory
  **flask that fills** with the accent as item-count progresses, ↑/↓ direction,
  "N of M", current note title, byte tail for big media) → muted space meter →
  contextual action → account footer + Sign out. New sync-layer data: `getAccount`
  (/me), `getQuota` (/me/drive), and an engine `onProgress` feed (pull/push are
  classified first so the total is known before the first transfer). Honours
  prefers-reduced-motion. Visual gallery of all states shared with the owner.
- **Tests:** `tokens.test.ts` (9, classification + single-flight + persist safety),
  engine progress emission (+2), `SyncStatus.test.tsx` (7, every state + honest
  copy + right action). Full suite 294/294, tsc + web build clean.
- **Hotfix (2026-10-08):** a nameless `/delta` tombstone (deleted item with only an
  id + deleted facet, no `name`) crashed every sync with
  `undefined is not an object (t.endsWith)`. `noteIdFromName` is now null-safe and
  the engine maps a nameless tombstone back to its local note by remote id so the
  deletion still propagates. Regression test added; suite 295/295.
- **✅ Owner-verified (2026-10-08): "all works. perfect."** Merged to `main`, native
  `.app` rebuilt + installed. This follow-up is complete; folder → CLOSED.

## ✅ Update complete (2026-10-07)
All five phases built and verified. The desktop sync spine is live: keychain-backed
OAuth, a portable Graph adapter, delta pull + conditional push, both-direction
conflict detection, and a minimal status UI. Ready for owner testing in the native
app, then merge to `main` + rename folder → CLOSED. PWA-CAPTURE can now build on this
spine once its SPA-redirect auth is confirmed (the one remaining portal item).

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
