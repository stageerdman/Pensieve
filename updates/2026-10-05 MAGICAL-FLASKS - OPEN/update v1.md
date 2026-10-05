# Update v1 — MAGICAL-FLASKS

## Goal
Two things the owner asked for:
1. **Magical colours** — nudge the current Notion-faithful theme toward a subtle deep-blue /
   "magical" feel in BOTH light and dark, while keeping the main note **text** very close to
   today's (readability first). Reference: the owner's own `04-everyday-pensieve` concept.
2. **Per-note flask icons** — like Notion's per-note icon picker, but the icons are magical
   **memory flasks**: the user picks a flask **shape**, then a **colour**. No emoji; real
   rendered SVG. A sensible **default** flask for notes with no icon yet. Shown small next to
   each note in the sidebar (where the category dots are today) and large at the top of the
   open note (click to open the picker). Reference flask visuals: `04-apothecary` (parametric
   `flaskSVG`) + `02-strands-and-vials`.

## Constraints (owner)
- Keep body text readable — only a *touch* deeper/bluer.
- Flask colours reuse the existing 9-colour category palette tokens (`--cat-*`) so they are
  theme-correct automatically. No parallel hex palette.
- Flask shapes must be distinguishable by silhouette (colours repeat across notes).

## Architecture notes (verified)
- A note's user metadata (categories/tags/links) lives in **frontmatter** (truth), is mirrored
  into **NoteMeta** for the fast sidebar list, and is edited via `useNotes.updateMeta(Partial<NoteFields>)`.
  The new `icon` field rides the **exact same path** — add to `NoteFields` + `NoteMeta`,
  encode/decode in `md/frontmatter`, mirror in `store/tauri` `.meta.json`, (browser store rides
  the JSON blob for free), surface in both `list()`s.
- `icon` shape in the type system: `{ shape: FlaskShape; color: CategoryColor }`.
  Frontmatter encoding: `icon: <shape>/<color>` (e.g. `icon: round/blue`).

## Phased roadmap
- [x] **Phase 0** — Plan + branch `update/magical-flasks` + UX-expert agents (visual system; picker + theme tokens).
- [ ] **Phase 1** — Data model: `FlaskShape` + `NoteIcon` types; `icon` in `NoteFields`/`Note`/`NoteMeta`;
  frontmatter encode/decode; store mirroring; default-icon helper. Tests for frontmatter round-trip.
- [ ] **Phase 2** — Theme nudge in `src/index.css` (synthesize agent B's token values; AA-checked).
- [ ] **Phase 3** — `Flask` reusable SVG component (synthesize agent A's shape spec) + shape library.
- [ ] **Phase 4** — `FlaskPicker` popover (shape grid + colour row) + integrate in `NoteRow` (small,
  display) and a large clickable flask above the editor (opens picker). Wire to `updateMeta`.
- [ ] **Phase 5** — Tests + verify in the running app (web dev server), then merge to main + native build.

## Live status
- 2026-10-05: Phase 0 done. Baseline: 76 tests pass, typecheck clean. Two UX agents dispatched.
  Building Phase 1 (data model) while agents design.
