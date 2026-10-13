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

## v2: time travel + hold-to-restore (replaced the in-panel preview)
- **Viewing a version is a MAIN-PAGE mode, not a panel preview.** `App.previewEntry`
  (a `TimelineEntry | null`) is the single source of truth: non-null → the main area
  renders a read-only `NotePreview` of that snapshot + a quiet "read-only / Back to now"
  banner; null → the live editable `Editor`. The panel is now a dumb list that just calls
  `onPreview(entry|null)` and reads `previewTs` back for the highlight.
- **Never strand the user read-only.** `previewEntry` resets on note-switch (`currentId`
  effect) and whenever the Timeline closes (`!timelineOpen` effect); the banner also has an
  explicit "Back to now". Clicking the newest record = `onPreview(null)` = live.
- **Highlight = what the main page shows.** `highlightedTs = previewTs ?? newestTs`, marked
  with a leading `›`. The old "Current" text label is gone (the highlight replaces it).
- **Restore is a press-and-hold, not a two-click.** `RestoreControl`: click arms
  ("Hold me", red); a 2s pointer-hold (`setTimeout`, not rAF — so it's fake-timer testable)
  commits; a red wash (opacity ramp) + a bottom bar (width ramp) are the visual countdown;
  releasing early or idling ~2s disarms. Only shown on the highlighted *historic* record
  (never the newest — restoring current is a no-op).
- Restore control `<button>` is a SIBLING of the row `<button>`, not nested (nested buttons
  are invalid HTML); it `stopPropagation`s so the hold gesture never toggles the row.

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
