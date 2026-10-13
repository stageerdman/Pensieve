# CLOUD-RESTORE — restore fully from cloud

## Goal
In the Sync / cloud-settings panel, add a way to **restore the whole vault from the
cloud** — overwrite everything on this device with the cloud copy, discarding local
changes. This is the opposite of a normal two-way sync (which would *push* local
changes up). It's the owner's "something got messed up locally — take me back to the
cloud" escape hatch.

UX requirement (owner): it must be **extremely minimal** — not a button, just quiet
text you can click, which then **asks for confirmation** before wiping local. Must
exist in **both** the desktop app and the phone PWA.

## Why confirmation, not a hold
Destructive and rare. A dotted-underline text link that, on click, reveals an inline
"This replaces everything on this device… · Restore / Cancel" confirm (auto-disarms
after a few seconds). Matches the quiet, no-modal spirit of the sync panel; distinct
from the timeline's hold-to-restore (that one repeats per-version, so a hold fits;
this one is a single deliberate escape hatch, so an explicit confirm reads clearer).

## Roadmap
- **Phase 1 — Desktop engine.** `restoreFromCloud(graph, vault, onProgress?)` in
  `engine.ts`: gate on remote root, download every remote `.md` over local, delete
  local notes absent from the cloud, rebuild sync state as a fresh baseline
  (`deltaLink = null`). Expose as `createEngine().restore`. Add `restoreFromCloud`
  to `useSync` (reuses `runSync` so progress/success/error are identical to a sync).
  Tests in `engine.test.ts`.
- **Phase 2 — Desktop UI.** `RestoreFromCloud.tsx` quiet-text confirm; render in the
  `SyncStatus` panel (connected only), above the footer.
- **Phase 3 — Phone UI.** `phone/.../sync/RestoreFromCloud.tsx` mirror; render in the
  sync `SpellWindow`; wire `onRestore` through `SpellMenu` → `PhoneApp`. Phone is a
  prototype (no real cloud) so restore runs the existing cast visual with
  pull-flavoured copy.
- **Phase 4 — Verify.** `npx tsc --noEmit`, `npm test`, `npm run build`; then merge to
  main + `npm run tauri:build` so the owner can test the native app.

## Status
- Phase 1 (desktop engine + tests): done.
- Phase 2 (desktop UI + test): done.
- Phase 3 (phone UI + test): done.
- Phase 4 (verify + merge + native build): in progress — all tests green (556),
  web + phone builds clean; merging to main and running `npm run tauri:build`.
