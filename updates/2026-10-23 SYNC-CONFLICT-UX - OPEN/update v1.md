# SYNC-CONFLICT-UX — fix the sync-conflict panel

## Goal
The owner reported the OneDrive conflict-resolution panel (SyncStatus.tsx) was
broken in practice: when several notes conflict at once (e.g. after being offline),
resolving one conflict freezes the panel and appears to "reset and reupload
everything," and conflicts can only be resolved one at a time.

## Root cause
`keepLocal(noteId)` in `useSync.ts` resolved the conflict then immediately forced a
full `syncNow()` — a complete two-way sync (full `/delta` re-pull, re-classification
of every note, reprocessing all pending media). While that full sync ran, a `busy`
flag blocked every other panel interaction, including clicking a DIFFERENT
conflict's button. This was a deliberately-scoped v1 cut when ONEDRIVE-SYNC shipped
(see that folder's wiki.md) — no batching, no "keep remote" option.

## UX research
Per CLAUDE.md, ran two UX-expert agents in parallel before building:
1. **Behavior model** — recommended decoupling "resolve" from "sync": a resolution
   should be an instant, local-only engine call (not a full sync), with propagation
   deferred to the next sync. Flagged a real gap: there was no "keep the cloud
   version" option, only "keep local." Recommended against full multi-select
   (too much chrome for a single-user app) in favor of one bulk shortcut for the
   common case.
2. **Visual design** — recommended: a one-line fact per row instead of static
   boilerplate text, a smaller secondary "use the other version" link, a per-row
   resolving/error state instead of a panel-wide freeze, and a scrollable
   height-capped region for the conflict list (the panel is already a full-height
   drawer — it just needed internal scroll, not a new surface).

## What was built (Phase 1 — complete)
- **Engine** (`src/lib/sync/engine.ts`): `SyncConflict` now optionally carries
  `localUpdatedAt`/`remoteUpdatedAt` (captured where the engine already has both
  sides in hand during pull classification, for the "both-changed" case). Added
  `resolveKeepRemote` — the missing counterpart to `resolveKeepLocal`: downloads
  the remote copy over local immediately, rehydrates any newly-referenced media,
  so the note reads as fully resolved without waiting on a full sync.
- **Hook** (`src/hooks/useSync.ts`): `keepLocal`/`keepRemote` are no longer routed
  through `runSync`/`busy` — each is one lightweight engine call, resolved
  optimistically in the UI the moment it succeeds. Concurrent resolves are
  serialized onto a tiny promise queue (so their state-file read-modify-writes
  can't race each other), and a single debounced trailing `syncNow()` is chained
  onto the END of that same queue (600ms after the last click) so a burst of
  clicks collapses into exactly one follow-up sync instead of N. A failed resolve
  keeps the conflict in the list with an inline error, and does NOT schedule a
  sync (nothing actually changed). Added `keepAllLocal()` (one shortcut that
  resolves every pending conflict the same way, for the common "trust this
  device" case) and `resolvingIds`/`conflictErrors` for per-row UI state.
- **UI** (`src/components/SyncStatus.tsx`): each conflict row now shows a one-line
  fact (relative time) instead of flat boilerplate, a primary "Keep this device's
  version" + secondary "Use the other version" action, a per-row "Applying…" state
  while resolving (other rows stay fully interactive), and an inline error with a
  retry affordance on failure. A "Keep this device's version for all (N)" shortcut
  appears once 2+ conflicts are pending. The list itself is capped at `40vh` with
  its own scroll so 10+ conflicts don't push the rest of the drawer off-screen.
- **Tests**: engine tests for the new timestamp fields and `resolveKeepRemote`;
  hook tests covering instant resolution (no synchronous full sync), the debounced
  single trailing sync after a burst of resolves, failure handling (conflict stays,
  no follow-up sync), `keepRemote`'s `onChanged` notification, `keepAllLocal`, and
  the same-row double-click guard; component tests for the new row states, the
  "use the other version" action, and the bulk shortcut's visibility threshold.
  Found and fixed a real bug along the way: the debounce timer wasn't cleared on
  unmount, which could fire a sync after the owning component was gone.

## Status
- [x] Phase 1 — engine + hook + UI + tests (`npm test`: 922 passed; `npx tsc
  --noEmit`: clean; `cargo check`: clean, no Rust changes).
- [ ] Phase 2 — native build + install to /Applications, update `issues.txt`.
- [ ] Owner device test: let several conflicts pile up (or simulate via editing
  the same note from two sync states) and confirm resolving one doesn't freeze
  the others, and that a burst of "keep this device" clicks doesn't visibly
  re-trigger a full backup pass.
