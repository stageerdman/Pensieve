# PHONE-MEDIA-DRAG — update v1

## Goal
Make media on the PHONE fully manipulable by hand. Four owner asks:

1. **Drag a block to reorder it** — drag a single image OR a gallery up/down among the note's
   blocks (text + media) to reposition it.
2. **Drag an image onto a gallery → merge** — dropping a standalone image block onto a gallery
   folds it into that gallery.
3. **Pull a photo out of a gallery → note** — in the gallery board, besides *remove* (delete),
   *pull out* a photo so it leaves the gallery and becomes a standalone image block placed
   directly UNDER the gallery in the note.
4. **"Edit" spell in the gallery** — a new spell that toggles an EDIT MODE on the board; remove +
   pull-out live only in edit mode (view mode stays clean: tap a photo = lightbox).

Scope: PHONE app only (`phone/src/`). Separate from the already-shipped keyboard fix
(`fix/phone-media-keyboard-drag`, committed).

## Context / what exists today
- Note body = one uncontrolled contentEditable; media are imperative `.ph-media` blocks
  (`mediaDom.ts`). No block-drag in the body today (only the gallery board had reorder).
- Gallery board = `PhoneCollection.tsx` overlay; existing long-press reorder is **known-buggy on
  iOS** (commit 183ebaf deferred it). Opened with `editable:true` always; × remove is always shown.
- `collectionController.ts` = pub/sub bridge; has onRemove / onReorder / onAdd. Needs onExtract
  (pull-out) + an editMode flag.
- Spell menu / Dock: (mapping in progress — see wiki once explored) — this is where the new
  "Edit" spell registers + dispatches, scoped to the board context.

## Hard reality (iOS gestures)
A long-press-lift inside a vertical scroll container / contentEditable is the known-hard part and
is ALREADY buggy for the simpler board case. Drag work needs on-device iteration (owner tests on
the phone over LAN). Plan favours: ship the high-confidence, gesture-free parts first (edit mode,
pull-out, the Edit spell), then the drag system with device logging + iteration. Final gesture
decisions pending the UX report.

## Roadmap (phases; commit+push each) — finalized after UX + spell-system reports
- [x] **P0 — Research synthesis.** Spell-system map + UX recommendation folded into wiki.md.
  Decision: HANDLE-based drag (not long-press); pull-out = button; 3-zone hit-test; editMode flag.
- [ ] **P1 — Edit spell + edit mode on the board (gesture-free, high-confidence).**
  `editMode` flag (default false) separate from `editable`; "Edit" spell (board-scoped) toggles it
  → lit "Done". View mode clean (tap = lightbox); edit mode shows ×. New `edit` icon + glyph.
- [ ] **P2 — Pull-out button (gesture-free).** Edit-mode top-left accent button → `pullOut(index)`
  → drops the photo from the gallery + inserts a `.ph-image` block right under the gallery; haptic.
- [ ] **P3 — Board reorder via a HANDLE (replaces the buggy long-press).** Handle appears in edit
  mode; pointerdown on it lifts instantly (reuse the ghost engine, delete the timer race). Device.
- [ ] **P4 — Note-body block drag via a handle.** Reorder image/gallery blocks among text; 3-zone
  merge-onto-gallery. New engine adapting the board's ghost mechanism. Device iteration (+ logging).
- [ ] **P5 — Verify on device, build, merge.** Two-tap fallback in reserve if handle-drag is flaky.

## Status
- P0 done. **P1+P2 shipped** (Edit spell + edit mode; pull-out to note). **P3 shipped** (board
  reorder via a handle, replacing the flaky long-press). All on branch
  `fix/phone-media-keyboard-drag`; phone suite 144 green, phone build OK.
- **Checkpoint before P4**: P1–P3 + the keyboard fix need DEVICE verification (owner tests over
  LAN). P4 (note-body block drag) reuses P3's handle+ghost pattern, so validating the board
  handle-drag on-device first de-risks P4. Two-tap fallback in reserve if continuous drag is flaky.
- Next: build P4 (note-body block reorder + drag-into-gallery) after device feedback on the foundation.
</content>
