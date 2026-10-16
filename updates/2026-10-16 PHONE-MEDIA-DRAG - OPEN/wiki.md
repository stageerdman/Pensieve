# PHONE-MEDIA-DRAG — wiki (decisions & lessons)

## The core gesture decision: HANDLE, not long-press
A long-press-to-lift inside a vertical scroll container is the exact thing already buggy in the
gallery board (the `LIFT_MS`/`MOVE_CANCEL_PX` timer race against iOS native scroll), and in the
note body it's strictly worse — the body is a live contentEditable, so a hold fires iOS text
selection / loupe / caret. Fix for BOTH surfaces: an explicit **drag handle**. Touch on the handle
= drag (pointer-capture immediately, no timer); touch anywhere else = scroll / tap / type. This
deletes the race and is also the calmer, more predictable interaction. Replacing the board's
long-press trigger with a handle likely *fixes* the known-buggy reorder as a side effect.

## Shared drag engine (reuse the board's proven mechanism)
The ghost-clone approach in `PhoneCollection.tsx` is the de-risked core and is reused everywhere:
position:fixed clone pinned to the viewport rect, dim the source in place, pointer-capture on a
stable container, `elementFromPoint` hit-test (the ghost is pointer-events:none so it reads the
element under the finger), `edgeScroll` auto-scroll near the top/bottom bands. Drive it from
`pointerdown on the handle` instead of a timer so it lifts instantly.

## Reorder vs merge — a 3-zone hit-test (note body)
For the block under the finger: top ~30% / bottom ~30% → REORDER (show an insertion line in the
gap, drop reorders the top-level DOM children). Middle ~40% AND target is a gallery/image → MERGE
(highlight the whole target, drop runs `mergeInto` — image→gallery adds; image→image promotes to a
gallery). Persistence is free: `serializeNoteBody` reads child order + `data-media`, so a DOM
reorder / mergeInto + `ctx.onChange()` is all that's needed.

## Pull-out = a BUTTON, not a drag
The board is a full-screen sheet covering the note, so there's no visible note to drag onto —
a drag-out gesture targets an invisible thing. So pull-out is a corner button, shown only in edit
mode. Top-LEFT, accent-tinted, eject glyph (box + up-arrow), aria "Pull out to note" — opposite the
top-RIGHT quiet/danger × so extract is never confused with delete. It inserts a standalone
`.ph-image` block directly AFTER the gallery element in the note, drops the photo from the gallery,
`ctx.onChange()`. Confirm with haptic(12) + the tile flying downward (toward the memory). If <2
photos remain the gallery collapses to a single image and the board auto-closes (same rule as
remove).

## Edit mode = a new flag, separate from `editable`
`editable` = "the note permits edits" (set at open). `editMode` = "affordances are ON now",
default FALSE. View mode (default): clean — no ×, no pull-out, no handles, tap photo = lightbox
(a deliberate behavior change; the board was always-× before). Edit mode: ×, pull-out, and drag
handles appear; tap-to-lightbox suppressed. The "Edit" spell (board-scoped, `conditionalSpells
("collection")`) is a TOGGLE — lit + labeled "Done" while editing. Exit: cast again / tap board bg
/ Back. This is a new toggle shape for the momentary-cast spell model.

## Note body: handle is persistent-but-subtle (no separate mode/spell)
Owner asked to "drag image and gallery in the text" — no mode was requested there, so media blocks
carry a small, subtle grip handle directly (pointer-capture from its pointerdown kills caret /
selection without needing contentEditable=false). Keeps it to the owner's literal ask with minimal
new chrome. (The UX pass offered an "Arrange mode" alternative if the persistent handle reads
cluttered — kept in reserve.)

## Fallback if handle-drag is still flaky on device: two-tap move
Tap a handle to "pick up" (lifts + highlights, surface enters a waiting state), then tap a gap to
drop or tap a gallery to merge. No continuous drag → zero scroll conflict. Reuses the same hit
zones. Keep in pocket for the device-iteration phases.

## Spell-system integration (how the Edit spell wires in)
- `types.ts`: add `"edit"` to the `IconName` union (and PATHS in SpellGlyph becomes a compile error
  until the glyph is added — a total Record).
- `SpellGlyph.tsx`: add the `edit:` SVG path.
- `registry.ts` `conditionalSpells("collection")`: add `{ id:"edit", name:"Edit", icon:"edit" }`.
- `collectionController.ts`: add `editMode` + `setEditMode`/`toggleEditMode` (emit); `pullOut(index)`
  + `onPullOut` callback.
- `mediaDom.ts` `openCollection`: open with `editMode:false`; wire `onPullOut`.
- `PhoneApp.tsx` `castSpellAction`: `else if (s.id === "edit") phoneCollection.toggleEditMode();`
- `registry.test.ts`: update the expected collection roster.
There is ONE `useSpellMenu` + ONE `castSpellAction`; context (`collection`) is derived from
`collectionOpen` in PhoneApp, so the board's spell routes through the same dispatch.
