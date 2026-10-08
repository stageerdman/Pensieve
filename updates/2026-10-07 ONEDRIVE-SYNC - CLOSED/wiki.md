# ONEDRIVE-SYNC — wiki (durable findings)

## Reused infrastructure
- **Azure app**: `onedrive-manager`'s registration (originally RecBar's). Tenant
  `consumers` (personal accounts). Scopes `openid profile offline_access User.Read
  Files.ReadWrite`. Secrets in `/Users/stage/dev/onedrive-manager/.env`.
- **Stored accounts** live in `onedrive-manager/data/onedrive-manager.db`
  (`accounts` table), refresh tokens **AES-256-GCM** encrypted as `iv:tag:ct`
  (all base64), key = `TOKEN_ENCRYPTION_KEY` (64 hex). Decrypt helper mirrored in
  the spike.
- Pensieve will use the **Stage Erdman** account (`s.microsoft@erdman.xyz`,
  id `974255cf67084b26`).

## Open question being tested in the spike
- **Secret-less PKCE (public client) for personal accounts?** `onedrive-manager`'s
  CLAUDE.md records `AADSTS70002` on the secret-less path and a fallback to a
  confidential Web app + secret. Hypothesis: that was because the redirect was
  registered under the **Web** platform; an **SPA** platform redirect enables
  auth-code+PKCE with no secret (+ CORS for browser). Must confirm before the PWA
  can be a pure client-side app with no backend.

## Findings — Phase 0 spike (2026-10-07, real Stage Erdman OneDrive) ✅
Ran `spike/spike.mjs`. All sync primitives proven against the live drive:

1. **Token refresh** — `refresh_token` → `access_token` works (1h expiry). The
   **secret-less** refresh returns `AADSTS70002: must include a 'client_secret'`
   — confirming the known issue. This is because the Azure app's redirect is
   registered under the **Web** platform. ⇒ For the PWA we MUST add an **SPA**
   platform redirect (enables auth-code+PKCE+CORS, no secret). The spike can't
   exercise the SPA auth-code path headlessly (needs an interactive browser login
   against a registered SPA redirect) — **that is the one remaining thing to
   confirm, and it's a portal change + a browser login, not a code problem.**
   Desktop (Tauri) is unaffected: it can keep using a confidential flow or its own
   native redirect.
2. **Folder create** — `POST /me/drive/root/children` with `folder:{}` → 201.
3. **Upload `.md`** — `PUT /root:/{folder}/{name}:/content` → 201, parent path
   resolved fine. Returns `id`, `eTag`, `cTag`.
4. **Read back** — content is **byte-exact** with what we wrote.
5. **Conditional write (correct tag)** — `PUT …/content` with `If-Match: <cTag>`
   → 200, and the **cTag increments** (`…,1` → `…,2`).
6. **Conditional write (stale tag)** — same `If-Match` after the file moved on →
   **412 Precondition Failed**. This is the whole single-writer guarantee: a
   device that didn't re-sync **cannot silently overwrite**. Conflict is detected,
   not lost.
7. **Delta cursor** — `/root:/{folder}:/delta` drains to a `@odata.deltaLink`;
   after adding one new note, querying that link returns **only** the changed
   items (the new file + its parent folder), nothing else. True incremental sync.

### Practical notes for the real adapter
- **Use `cTag` (content tag) for `If-Match` on content writes** — it changes on
  content change specifically; it worked cleanly for 200-then-412. (`eTag` also
  changes on metadata-only changes.)
- Delta lists the **parent folder** alongside changed children (its child-list
  changed) — the adapter should treat folder entries as structural, not notes.
- Reuse `onedrive-manager`'s `graphFetch` retry/429 pattern verbatim.
- Spike artifacts left in `/Pensieve-Spike/` on the drive so the owner can see
  them; safe to delete anytime (isolated from real data).

**Verdict:** the simple single-writer + eTag-guard + delta model is fully
supported by Graph for personal OneDrive. Phase 1 (Tauri auth) is unblocked. The
PWA's secret-less auth needs the SPA-redirect confirmation first.

## Phase 1 — Tauri auth + keychain token storage (2026-10-07) ✅
Built the native auth + token plumbing. Architecture: a **portable TS sync core**
(`src/lib/sync/`) that is token-source-agnostic, plus a thin **Rust layer** for the
three things only the native shell can do.

### Rust (`src-tauri/src/sync.rs`)
- `secret_get/set/delete` over the OS keychain via the `keyring` crate
  (`apple-native` → macOS Keychain). Service namespace `xyz.erdman.pensieve.sync`.
- `oauth_listen(port, path, timeout_secs)` — a one-shot loopback HTTP server
  (plain `std::net::TcpListener`, no extra crate). Binds `127.0.0.1:<port>`, waits
  for the browser redirect, parses `code`/`state`/`error` from the query, answers a
  "you can close this tab" page, returns the values. Non-blocking accept + deadline.
- `open_url` — opens the consent screen in the system browser (`open` on macOS),
  scheme-guarded.

### TS (`src/lib/sync/`)
- `config.ts` — Azure config from the keychain (`azure-config`) with a dev/env
  fallback; scopes, `REMOTE_ROOT = "Pensieve"`, redirect port/path parsing.
- `oauth.ts` — PKCE (Web Crypto, not node:crypto), authorize URL, code exchange +
  refresh. Sends the client secret only when present (confidential desktop app);
  omitting it is the future public-client/PWA path.
- `native.ts` — typed wrappers over the Rust invoke commands; the ONLY place that
  touches `invoke`. Throws a clear error off-desktop.
- `tokens.ts` — access-token provider: in-memory cache, silent refresh, rotates +
  re-persists the refresh token, throws `ReconnectNeededError` when disconnected.
- `connect.ts` — the interactive loopback flow (listen → open browser → exchange →
  store refresh token) and `disconnectOneDrive`.

### Auth decision (no Azure portal change needed for desktop)
The desktop reuses the **existing** Azure "Web" app via a **confidential loopback**
flow: listen on the registered redirect `http://localhost:3000/api/auth/callback`,
exchange the code with PKCE **+ client secret**. This needs no portal change — the
SPA-redirect requirement is the PWA's blocker, not the desktop's.

### One-time bootstrap (owner's machine)
`setup/seed-keychain.mjs` seeds the keychain from onedrive-manager's `.env` + stored
(encrypted) refresh token for the Stage Erdman account, so Pensieve reads as
connected immediately — without an interactive login. Ran it 2026-10-07 ✅. The
in-app "Connect" button runs the real OAuth flow; "Disconnect" deletes the token.

### Keychain read/write from the CLI (handy for debugging)
`security find-generic-password -s xyz.erdman.pensieve.sync -a refresh-token -w`
reads a value; `add-generic-password -U …` writes one.

## Phase 2 — OneDrive remote adapter (2026-10-07) ✅
`src/lib/sync/graph.ts` + `adapter.ts`. Model: one flat remote folder `Pensieve/`
holds one `<noteId>.md` per note (the .md is the source of truth; system fields are
derived on pull; no sidecars synced in v1).

- `graph.ts` — `makeGraphClient(provider)`: retries 429/503 with Retry-After,
  refreshes once on 401. The token comes from an **injected provider**, so the
  adapter is driven by the keychain path in prod, a Node token in the integration
  check, and a fake in unit tests (dependency injection = portable + testable).
- `adapter.ts` — `ensureRoot`, `listNotes` (excludes folders/non-.md, follows
  `@odata.nextLink`), `downloadNote` (null on 404, byte-exact content),
  `uploadNote` (If-Match cTag → 412 → `ConflictError`), `deleteNote` (404 = success),
  `delta` (drains nextLink → returns items + the deltaLink to persist).

**Verified against the live drive** via `spike/adapter-check.mts` (`npx tsx …`):
12/12 — ensureRoot created the real `Pensieve/` folder, create/list/download
byte-exact, conditional 200 + cTag bump, stale → ConflictError, delta saw the probe,
delete cleaned up. Plus 10/10 Vitest unit tests (`adapter.test.ts`) with a fake
GraphClient locking URL construction, If-Match, 412/404 mapping, and pagination.

## Phases 3 & 4 — delta pull + push + single-writer guard (2026-10-07) ✅
`src/lib/sync/vault.ts` (injectable `LocalVault`, Tauri on-disk impl) + `engine.ts`
(the `sync()` orchestrator). One pass: **pull first, then push.**

- **Pull** drains `/delta` from the saved cursor, applies remote upserts/deletes to
  the vault, and persists the new deltaLink + per-note cTag.
- **Push** sends locally-changed notes with a conditional `If-Match` cTag; local
  deletions become remote deletes.
- **Conflict detection, both directions.** A note changed on BOTH sides is reported
  (`both-changed`) and **left untouched** — never clobbered. Push's `If-Match` is the
  backstop (`push-rejected` / `delete-rejected`). A both-changed note is set aside in
  pull so push doesn't re-attempt and double-report it.

### Key design fix — skew-proof change detection
"Did this note change locally since the last sync?" compares the note's **own
`updatedAt`** against the `updatedAt` we recorded at last sync (`rec.localUpdatedAt`),
NOT against the sync wall-clock. Same clock source on both sides of the comparison →
immune to device/clock skew. (Caught by the first engine test; `NoteSyncRecord` now
carries `localUpdatedAt`.)

### Known v1 ambiguity (documented, acceptable under single-writer)
Local-delete vs remote-edit of the same note: pull re-applies the remote edit
(resurrects the note) because a deleted local file can't signal "I changed." Fine for
single-writer discipline; revisit if real multi-device editing lands.

### Verified
- 8/8 engine unit tests (`engine.test.ts`) with an in-memory vault + a fake OneDrive
  modelling delta/cTags/If-Match: initial pull, push-new, idempotent re-sync,
  conditional edit, remote-only edit, both-changed conflict, remote delete, local delete.
- 9/9 live-drive integration (`spike/engine-check.mts`): real two-device round-trip,
  both-changed conflict, deletion propagation.
- Full suite 275/275, tsc clean.

## Follow-up findings — the two "bugs" (2026-10-08)
Durable lessons from the owner-reported "sign-in expired every sync" + "infinite
syncing":

- **Secret-less refresh WORKS for Pensieve's own app.** Earlier we assumed the
  public-client (empty `clientSecret`, redirect `localhost:8711/callback`) path
  would hit `AADSTS70002` like the onedrive-manager "Web" app did. It does **not** —
  a live `refresh_token` grant against the stored token returned HTTP 200 and
  rotated the token. So the own-app public-client desktop path is fine; **don't**
  switch desktop back to the confidential app or touch the Azure portal for this.
  (Diagnose with a one-off node script that reads keychain `azure-config` +
  `refresh-token`, POSTs the grant, and — crucially — **persists the rotated token
  back** on success so the app's live state isn't broken.)
- **The real "expired" bug was a UI mislabel.** `SyncStatus` returned the literal
  "Sign-in expired." for *every* `error` phase. Any Graph 5xx / network blip /
  delta hiccup therefore read as an expiry. Lesson: never hardcode one error cause;
  classify (invalid_grant = expired; 5xx/network = transient; else show the real
  message) and surface it honestly.
- **Rotating refresh tokens need single-flight redemption.** MS rotates (and
  invalidates) the refresh token on each use. Two concurrent cold `getAccessToken`
  calls would redeem the SAME token → the second gets `invalid_grant` → a bogus
  "expired". `tokens.ts` now shares one in-flight refresh. Also: persist the rotated
  token, but a keychain-write failure must NOT discard the access token just minted.
- **Motion = transfer, full stop.** A rune that flows for "unsynced changes" or
  "disconnected" reads as "syncing forever". Reserve animation for the active
  `syncing` state; let colour (gold = changes waiting, red = not backing up) carry
  the rest.
- **Panel data not in v1:** account (`/me`), quota (`/me/drive`), and live transfer
  progress. The engine emits `onProgress` after classifying the work (so the item
  total is known up front); the local-deletions guard must use the *post-download*
  on-disk set or a freshly-pulled note looks deleted.

## Phase 5 — status UI, conflict resolution, tests (2026-10-07) ✅
Built the user-facing surface. Two UX experts ran in parallel and converged; I
synthesized and built one design (design.md: a whisper, not a shout).

- `useSync` hook — the state machine: unavailable (off-desktop) / disconnected /
  idle / syncing / synced / error / conflicts, plus `connect` / `disconnect` /
  `syncNow` / `keepLocal`. After a sync that pulled, it refreshes the note list and
  reloads the open note.
- `SyncStatus` component — ONE quiet cloud `IconButton` in the header, nearly
  invisible at rest (`text-muted`). Click → a small non-modal popover: status line +
  relative time, a primary action (Sync now / Connect / Reconnect), conflict rows,
  a single-writer footnote, and Disconnect. A `warn`/`danger` dot is the only colour
  the glyph shows; a brief `success` flash after a sync, then back to calm (no
  permanent green). Reduced-motion-aware spin while syncing.
- Conflict resolution v1: both-changed notes are listed; "keep this device's
  version" calls `engine.resolveKeepLocal` (adopt the remote cTag, force a local-wins
  push on the next sync). Cut for v1 (documented): a read-only "view the other copy"
  tab, diff/merge, auto-sync scheduling, settings page, per-note badges.

### Verified
- Unit: `engine.test.ts` 9/9 (incl. resolveKeepLocal round-trip). Full suite 276/276.
- `tsc --noEmit` clean; `npm run build` (web) clean.
- Native `.app` built + installed to /Applications via `npm run tauri:build` for
  owner testing.

### Owner test checklist (native app)
1. The header shows a quiet cloud icon. Click it → "Backed up." / "Synced … ago."
2. "Sync now" turns the arrows, then settles with a brief success flash.
3. Create a note → Sync now → it appears as `<id>.md` under `/Pensieve/` on OneDrive.
4. Edit the same note on another device/web, Sync now here → it pulls the change.
5. Edit here AND there without syncing between → the icon shows a warn dot and the
   popover lists the conflict; "Keep this device's version" resolves it.
6. Disconnect → icon shows the slash; Connect runs the real browser OAuth.
