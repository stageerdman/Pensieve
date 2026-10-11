# SPELL-MENU — durable decisions & lessons

## Terminology
- **Memory** = a captured thought (UI word; data type stays `Note`). Flask/vial = its glyph.
- **Spell** = any action performed on memories (replaces "action"/"wheel seat").
- The word "Search" stays banned → **Accio**. "New/Write" = create a memory.

## Replaces the Wand
The Wand thumb-wheel (`useWheelGesture`, `Wheel`, `WheelButton`, `AdjustGrip`, `DesignOverlay`,
the wheel physics in `lib/wand/wheelPhysics.ts` + wheel tunables in `constants.ts`) is archived
to `_archive/` in this folder. KEPT (still used): reel + loupe (`useReelFisheye`, `Reel`,
`Glass`), note editor (`NoteView`/`NoteBody`/`NoteToolbar`), sync machine (`syncMachine.ts`,
`useSyncState`, `SyncSpell`, `SyncPanel`), Accio (`accioQuery`/`accioRank`, `SummonBar`,
`SearchSheet`, `AccioPill`), flasks, conjure thread.

## Must-not-break (inherited locks from PHONE-UX / UI-FOUNDATION)
- Controls are a **persistent global layer**; the ONE thing that hides them is the real
  keyboard (`.kb-open` from `visualViewport`, NOT focus) + `.searching`.
- Menu actions from inside a note must `exitNote()` first or they open behind it.
- ONE scroller per surface; the reel keeps `isolation:isolate; z-index:0`. Any new overlay
  must respect the phone z-stack (menu/overlay layers sit above the reel+glass).
- rAF physics write transforms to DOM via refs, never setState; keyboard `.focus()` stays
  synchronous-in-gesture.
- Port/keep formulas verbatim + unit-test against tunables.

## Fake spell roster (explorable prototype) — finalized in P1
TBD. Working draft: General = Write, Accio, Sync, Stir, Pin, Label, Link, Highlight, Export,
Thread. Detailed example on a spell with variants. Conditional sets per page (reel / note).

## Lessons
- (to be filled as phases land)
