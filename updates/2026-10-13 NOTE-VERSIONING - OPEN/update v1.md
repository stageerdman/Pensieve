# NOTE-VERSIONING — restore past versions of a note

## Goal
Turn the read-only addition **Timeline** into real, restorable **versioning**. From a
note's Timeline you can click any past moment, see the note's content as it was then,
and press **Restore** to roll the note back to that version — discarding every change
after it.

Constraints (from the owner):
- **Local only.** No cloud sync; snapshots live in the same hidden sidecar files the
  timeline already uses (vault `timelines/<id>.json` / `localStorage` in the browser).
  The OneDrive/Graph backup layer never touches these — already true today.
- **Retention: the 7 most recent edit-*days*.** Not the last 7 calendar days — the 7
  most recent distinct days that actually had edits. Edits on an 8th (older) day are
  pruned.
- **Restore is destructive** (owner's explicit choice): restoring version *v3* reverts
  the note to v3 **and deletes v4…vN**. Confirmed in a two-step click to avoid misfires.
- **Scope: note body only.** A version snapshots the Markdown body. Category / tags /
  links / icon are left as they are now (they are rarely "edits" and stay lightweight).

## Design in one breath
The timeline already records one entry per *writing session* (a session closes after
`IDLE_MS` of inactivity). We make each entry **carry a snapshot of the body** at session
close. The timeline *is* the version history — one history, not two. Clicking a moment
renders that snapshot read-only (reusing `NotePreview`, the same BlockNote engine);
Restore writes the snapshot back and truncates the forward history.

## Roadmap (phase by phase)
1. **Data model + pure logic** — `TimelineEntry.markdown?` snapshot; `timeline.ts`:
   `makeEntry(..., markdown?)`, `pruneToRecentDays(entries, maxDays=7)`,
   `truncateAfter(entries, ts)`. Pure, unit-tested.
2. **Store layer** — `Store.saveTimeline(id, entries)`; both adapters prune to 7 days on
   append and implement `saveTimeline` (used by restore). Tests.
3. **Hook** — `useNotes`: `closeSession` snapshots `note.markdown`; new `restoreVersion(ts)`
   truncates history, writes the body, and remounts the editor via a `loadEpoch` bump so
   the restored text loads. Test.
4. **UI** — `TimelinePanel`: a moment expands to a read-only preview + a confirm-Restore
   button; `App` passes `theme`/`onRestore` and keys the Editor by `id:loadEpoch`.
5. **Verify + ship** — tsc, tests, web build; docs (`wiki.md`, `issues.txt`); merge to
   `main`; `npm run tauri:build`; confirm the installed `.app`.

## Status — BUILT, merged to main (web-verified; owner to confirm on the native app)
- [x] P1  data model + pure logic — `TimelineEntry.markdown`, `makeEntry` snapshot,
          `pruneToRecentDays`, `truncateAfter`; 14 timeline unit tests.
- [x] P2  store layer — `saveTimeline` + prune-on-append in both adapters; store tests.
- [x] P3  useNotes restore — snapshot on close, `restoreVersion` (destructive), `loadEpoch`
          remount; integration test.
- [x] P4  timeline panel UI — accordion + lazy `NotePreview` + Current marker + 2-step
          Restore; 4 render tests. App wiring (`id:loadEpoch` editor key).
- [x] P5  verify / docs — `tsc` clean, 548 tests green (5× stable), web `npm run build`
          OK; docs + `issues.txt` updated. Merge + native build below.

### How to test (owner)
Open a note, write, pause ≥2 min (or switch notes) to close a session — that records a
version. Repeat. Open the Timeline (clock icon). Click an older moment → it expands to
show the note as it was; click **Restore this version** then the red **Restore — deletes N
newer** to confirm. The note reverts and the newer moments vanish. The newest moment is
**Current** (no Restore). History keeps the 7 most recent edit-days.

### Decisions
- Restore = **destructive truncation** (drop newer). Owner-chosen, 2-step confirm.
- Version scope = **body only**.
- A "version" = one writing session (same granularity as today's timeline dots).
- Snapshot is taken at session **close** (end content); the entry's `ts` stays the
  session **start** (keeps day-grouping/order identical to today).
