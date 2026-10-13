# CLOUD-RESTORE — wiki

## What shipped
A "Restore everything from cloud" escape hatch in the sync panel, on both surfaces.
It makes this device an **exact mirror** of the remote `Pensieve` folder, discarding
local changes — the inverse of a normal two-way sync (which pushes local up).

## Decisions
- **Restore ≠ sync.** The existing `sync()` merges and would *push* local-only notes to
  the cloud and *delete* remote notes missing locally. A restore must do the opposite:
  download all, delete local-only, never push. So it's a separate engine entry
  (`restoreFromCloud`), not a flag on `sync()`.
- **Fresh baseline after restore.** `restoreFromCloud` rewrites `sync/state.json` from
  scratch with `deltaLink = null` and a record per downloaded note (cloud cTag). The
  next ordinary sync re-baselines cleanly and does NOT try to re-push the just-pulled
  notes (their cTags already match).
- **Reuses the SyncResult shape + `runSync`.** Restore is modelled as pure downloads
  (`pulled`) + local deletes (`pulledDeletes`), so `useSync`'s existing
  syncing/success/error handling and progress flask drive it unchanged — no new phase.
- **Confirm, not hold.** Timeline restore uses press-and-hold (it repeats per version,
  so a hold is ergonomic). Cloud restore is a single rare escape hatch, so a **quiet
  dotted-underline text → inline confirm (Restore / Cancel), auto-disarm 4s** reads
  clearer. It is intentionally not button-shaped (owner's ask). Shown only while
  connected + idle (hidden mid-transfer) so it can't collide with a running sync.
- **Phone is still a prototype.** No real OneDrive code lives in `phone/`. The phone
  restore reuses the existing cast visual with pull-flavoured copy (`castSpell` gained
  optional `weaving`/`done` labels). Wiring + confirm UX are real so it's a drop-in
  when the phone gets a real cloud layer.

## Verify
- `npx tsc --noEmit` (root + phone), `npm test` (556 pass), `npm run build`,
  phone `vite build`. Engine tests cover overwrite / local-only delete / re-baseline,
  empty-cloud wipe, and the remote-root-missing gate (local untouched). Component +
  boot tests cover arm → confirm → fire on both surfaces.
- Native: `npm run tauri:build` so the owner can test the real restore on-device.
