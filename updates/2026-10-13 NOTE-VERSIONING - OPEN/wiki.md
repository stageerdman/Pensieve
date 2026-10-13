# NOTE-VERSIONING — durable decisions & lessons

## What this is
Restorable version history for a note, built *on top of* the existing addition Timeline
rather than as a second system. Each timeline entry (one writing session) now carries a
body snapshot; the timeline IS the version history.

## Decisions that should not be relitigated without reason
- **One history, not two.** We extended `TimelineEntry` with an optional `markdown`
  snapshot instead of adding a parallel `versions/` store. The timeline already marked the
  right moments (per-session, idle-closed); versioning just gives those moments content.
- **Snapshot at session *close*, label by session *start*.** The entry's `ts` stays the
  session start (so day-grouping/order are byte-identical to the old timeline); the
  `markdown` is the body at close (what the note looked like after that burst).
- **Body only.** Category/tags/links/icon are not versioned — they're rare, lightweight,
  and not what "a version of my note" means. Revisit only if the owner asks.
- **Restore is destructive.** Owner's explicit choice: restoring v3 reverts the body and
  deletes v4…vN (`truncateAfter`). Guarded by a 2-step confirm in the panel. We do NOT
  keep forward history.
- **Retention = 7 most recent edit-*days*, measured against the history itself**, not the
  calendar. `pruneToRecentDays` keeps all entries whose day is among the 7 most recent
  distinct days present; an 8th older day is dropped whole. Enforced in the store's
  `appendTimeline`, so it can never grow unbounded regardless of caller.
- **Local & hidden — already free.** Snapshots live in the same sidecar the timeline
  always used (`timelines/<id>.json` in the Tauri vault / `localStorage` key in the
  browser). The OneDrive/Graph backup layer only ever touches the `.md` + media, never the
  timeline sidecar, so "no cloud sync, hidden in app resources" needed no new work.

## Lessons / gotchas
- **Editor loads content once on mount** (see Editor.tsx + the ⌘Z-wipe fix). Pushing a
  restored body by mutating the `markdown` prop would be ignored. Fix: a `loadEpoch`
  counter in `useNotes`, bumped on restore; `App` keys the Editor `${id}:${loadEpoch}` so a
  restore remounts it onto the restored body. (Do NOT key by `updatedAt` — that changes on
  every debounced save and would remount mid-type.)
- **Restore must cancel the in-flight session + queued save first**, else the pending
  autosave clobbers the restored body, or the abandoned session records a bogus snapshot.
- **Test harness quirk:** calling `create()` and `open(id)` inside a single `act()` can
  swallow the session close; split them into separate `act()` calls. Not a product bug —
  real usage separates these as distinct user actions.
