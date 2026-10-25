# PWA-CAPTURE — update v2 (supersedes v1)

## Why v2
v1 (2026-10-07) imagined a minimal, separate capture+read-only phone UI, blocked on
an auth spike that never ran. Since then, PHONE-UX (2026-10-08) built and
device-confirmed the real phone app — the Wand (reel browsing, note editor, Accio
search, Spell Menu, gallery, drag-reorder) — running entirely on fake seed data
(`phone/src/seed.ts`) with a mocked sync machine. v1's "capture + read only,
no editing" non-goal is already obsolete; the phone app now does far more than v1
scoped.

**What's actually left, and what this update does:** wire the already-built Wand
app to the real OneDrive vault instead of seed data, give it real local persistence
so it works like the desktop app (local-first, OneDrive as backup/sync — not a
network dependency), wipe the fake data, and host it at a stable HTTPS URL so the
owner can install it on their phone and always reach it.

## Goal
- Phone app's notes are real: read from and written to a local IndexedDB vault,
  backed up to / pulled from the owner's actual OneDrive via the same Graph
  primitives the desktop app already proved (cTag If-Match, /delta, single-writer
  conflict detection) — reusing `src/lib/sync/{graph,adapter,engine,oauth,config,
  types}.ts` as-is (already injectable/portable by design) with new phone-side
  implementations of the two Tauri-only seams: `LocalVault` (IndexedDB instead of
  native fs) and the secret store + OAuth connect flow (browser SPA redirect
  instead of the native loopback server).
- Seed data is gone from the runtime path. First load with no local vault and no
  OneDrive connection shows a real empty/connect state, not demo memories.
- Hosted at a stable Cloudflare Pages HTTPS URL (reusing the existing erdman.xyz
  Cloudflare account/token from `~/dev/html-posting/.env` — see memory
  `cloudflare-access-html-posting`) so the owner can install it once and always
  reach the same app.

## Non-goals (this update)
- No offline write queue beyond what IndexedDB + "sync when online" already gives
  for free — still online-only for the actual OneDrive round-trip, same as v1.
- No native chunked large-media transfer on phone (that's Rust-only — see
  `src-tauri/src/media_transfer.rs`). Phone media backup uses the plain
  whole-buffer Graph upload path (fine up to ~4MB; a session-based manual fallback
  for bigger files is a later update if it's ever needed from the phone).
- No rich conflict-resolution UI on phone (the SYNC-CONFLICT-UX panel is
  desktop-only). A conflict surfaces as a plain "this note changed elsewhere,
  pull latest before editing" message — good enough for a single-owner app where
  phone and desktop are rarely mid-edit on the same note at once.
- Custom subdomain (e.g. `pensieve.erdman.xyz`) is NOT wired in this update — the
  Cloudflare token has no Zone DNS:Edit scope. Ship on the default
  `*.pages.dev` URL; a custom CNAME is one manual dashboard step for later.

## One manual step the owner must do (I can't do this from here)
The existing Pensieve Azure app (`51c918c5-4039-4834-9cf8-39d3fa475ade`) only has a
**Mobile and desktop** platform redirect (`http://localhost:8711/callback`), which
Microsoft does NOT serve CORS headers for — fine for the native app's Rust-side
HTTP calls, but a browser `fetch()` to the token endpoint needs a **Single-page
application** platform redirect specifically (that's what gets CORS treatment).

- **Done (2026-10-24):** owner added the local-dev SPA redirect
  `http://localhost:5174/auth/callback`.
- **Still needed, now that Phase 5 hosting is live:** add a second SPA redirect on
  the same app for the production URL — `https://pensieve-phone.pages.dev/auth/callback`
  — portal.azure.com → App registrations → (the Pensieve app) → Authentication →
  Add a platform → Single-page application → that redirect URI. Connect won't work
  on the hosted URL until this is added.

## Phased roadmap
- **Phase 1 — Phone local vault.** IndexedDB-backed `LocalVault` (notes + sync
  state), matching the desktop `LocalVault` interface in `src/lib/sync/vault.ts`
  shape-for-shape so `engine.ts` is reused unmodified. A Note↔Markdown mapper
  (phone's `Note` type ↔ frontmatter `.md`) so a note written on the phone is
  byte-compatible with what the desktop vault expects, and a pulled desktop note
  renders correctly in the Wand.
- **Phase 2 — Browser OAuth + token store.** SPA redirect-based PKCE connect flow
  (full-page redirect to Microsoft, back to `/auth/callback`, exchange code via
  `fetch`) replacing the native loopback orchestration; refresh token persisted in
  IndexedDB (not localStorage, to dodge quota/XSS-adjacent sync-read risk from
  other scripts). Local dev working end-to-end against the real Azure app before
  touching hosting.
- **Phase 3 — Wire the Wand to real data.** Swap `createSeed()` for the real local
  vault; wire the existing `SyncPanel`/`SyncSpell`/`RestoreFromCloud` components to
  the real `connectOneDrive`-equivalent + `engine.sync()` instead of the mocked
  `syncMachine`. First real sync after Connect pulls the existing desktop vault
  down to the phone.
- **Phase 4 — Clear the fake data.** Remove `seed.ts` from the runtime import path
  (tests can keep a fixture if useful); add a one-time local-storage wipe so a
  phone that has been running the demo gets a genuinely blank slate before real
  data loads.
- **Phase 5 — Host on Cloudflare Pages.** `wrangler pages deploy` of the
  `build:phone` output, using the existing erdman.xyz account/token. Confirm the
  token covers Pages (untested) — if not, that's a quick owner dashboard token-scope
  addition, not a blocker worth escalating now. Produces a stable `*.pages.dev` URL.
- **Phase 6 — Tests + real-device verification.** Unit tests for the IndexedDB
  vault + Note↔Markdown mapper + browser OAuth pieces; `npm test` / `npx tsc
  --noEmit` / `build:phone` clean. Then owner device test: open the hosted URL on
  the iPhone, install to home screen, Connect OneDrive, confirm a note written on
  the phone shows up in the desktop app (and vice versa) after a sync.

## Live status
- 2026-10-24: v2 opened. Researched the full desktop sync stack (`src/lib/sync/*`)
  and confirmed `adapter.ts`/`engine.ts` are already injectable/portable — the only
  Tauri-specific seams are `vault.ts` (fs) and `native.ts` (secret store + loopback
  OAuth + native HTTP transport).
- **Phases 1–4 done.** IndexedDB/localStorage `LocalVault` + Note↔markdown mapper;
  browser PKCE OAuth (full-page SPA redirect, `/auth/callback`); the Wand wired to
  the real engine (`useOneDriveSync`, auto-summon on first sync); fresh-start wipe
  of seed data (vault + media IndexedDB + search recents) via a one-time migration
  in `main.tsx`. **Deviation from the plan above:** the refresh token landed in
  localStorage, not IndexedDB as originally scoped — simplicity/uniformity with the
  rest of phone storage, matching the project's existing "secrets in a plain file,
  not OS keychain" posture elsewhere. 974 tests passing, tsc clean, `build:phone`
  clean. All work happened on `update/pwa-capture` (NOT main — an earlier research
  agent had committed straight to main; moved to this branch before continuing).
- **Phase 5 done.** Cloudflare Pages project `pensieve-phone` created and deployed
  via `npm run deploy:phone` (`scripts/deploy-phone.sh`, reusing
  `~/dev/html-posting/.env` creds — that token already covers Pages, no owner
  action needed). Live at https://pensieve-phone.pages.dev. SPA fallback routing
  confirmed (`/auth/callback` returns 200, not 404).
- **Phase 6 done — owner-confirmed on device (2026-10-25).** Owner added the
  production Azure SPA redirect, installed the hosted PWA to the home screen,
  connected OneDrive, and confirmed sync works end-to-end. Three follow-up polish
  rounds landed after that first confirmation, all owner-reviewed:
  1. Desktop-parity sync UI: shared `SyncRune` component (exact lemniscate glyph +
     flow animation as `src/components/icons.tsx`), header swaps "N memories" for
     the rune whenever sync needs attention (reminder/syncing/offline/failed), Spell
     Menu's Sync glyph recoloured by live state, Spell Menu trimmed to the three
     real spells (Write/Accio/Sync — no leftover prototype placeholders), tap-to-
     cast/hold-to-open-panel on Sync, backdrop-tap dismiss (no "Done" button).
  2. Fixed: long-press on Sync was triggering iOS's text-selection/copy callout on
     the popup (`.spell-overlay` now disables user-select/touch-callout); "Sign
     out" recoloured red (the one destructive action in that footer); the
     center-screen cast overlay no longer shows any text (ring + rune only) — the
     header rune is the sole status signal outside the Sync window.
  - **CLOSED 2026-10-25.** Merged `update/pwa-capture` into `main`, branch pruned.
