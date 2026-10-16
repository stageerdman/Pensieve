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

## Roadmap (phases; commit+push each) — refined after UX + spell-system reports
- [ ] **P0 — Research synthesis.** Fold the spell-system map + UX recommendation into concrete
  phase specs; record decisions in wiki.md.
- [ ] **P1 — Edit mode + "Edit" spell (gesture-free).** Board opens in view mode; Edit spell
  toggles edit mode (× remove + pull-out visible, exit affordance). collectionController editMode.
- [ ] **P2 — Pull-out to note (gesture-free).** onExtract(index): remove from gallery + insert an
  image block right under the gallery in the note body; persist + serialize.
- [ ] **P3 — Block drag in the note body.** Reorder image/gallery blocks; drop-onto-gallery merges.
  iOS long-press/handle per UX; device logging.
- [ ] **P4 — (If reorder-within-board still wanted) harden the board reorder**, or fold into P3's model.
- [ ] **P5 — Verify (device), build, merge.**

## Status
- Exploring the spell-menu/dock system + gathering UX design. Keyboard fix already done on the
  sibling branch.
</content>
