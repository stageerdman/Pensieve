# Flask DNA (memory thread) + colour spectrum

Status: **CLOSED — owner-verified in the native app (2026-10-06).**

## Goal
Make each memory flask feel alive and unique, and give the owner free colour choice.

1. **Memory thread (DNA).** Replace the flask's single white "shine" streak (which already
   reads like a hair/thread on the glass) with a **memory thread**: a white strand inside
   the bottle, rising through the liquid, whose *shape is derived entirely from the note's
   id* — same id → same thread forever, different ids → visibly different strands. Like the
   logo's central wisp, but with a wide vocabulary: curly ↔ sharp, narrow ↔ wide, centred ↔
   to one side, even ↔ top-heavy, short ↔ long. Always white; spans the liquid ("as full as
   the bottle").

2. **Colour spectrum.** Replace the 9 preset swatches in the flask picker with a **draggable
   hue spectrum**. Keep it theme-correct and AA+ by storing only the *hue* and resolving
   saturation/lightness from new `--flask-s`/`--flask-l` tokens (light/dark) — no parallel
   hex table, same philosophy as the `--cat-*` palette. Legacy palette-key colours still
   render and parse.

## Design decisions
- **Thread = pure function of id.** `memoryThread(seed, yTop, yBottom)` → SVG path `d` + width.
  A string hash (xmur3) seeds a mulberry32 PRNG; parameters pulled from it: node count
  (3–7), amplitude (width), horizontal bias (side), smoothness↔sharpness (Catmull-Rom cubic
  vs. polyline), envelope skew (top-/bottom-heavy), stroke width, end taper. Deterministic,
  no stored state.
- **Thread spans the liquid**, bottom (body floor) → surface (`level`), clipped to the body,
  so it's always over coloured liquid (white reads well in both themes) and grows with the
  note's content. Detailed sizes only (size ≥ 20), like the old streak.
- **Colour model.** `NoteIcon.color: CategoryColor | number` (number = hue 0–359). Channels
  helper resolves both to an `H S% L%` triplet for `hsl(... / a)`. Frontmatter: `h<hue>`
  (e.g. `vial/h212`); keys still accepted.
- The specular glint / meniscus highlight / rim gloss (the rest of "shine") stay; the Shine
  knob keeps controlling them. Only the side streak becomes the thread.

## Roadmap / status
- [x] **Phase 1 — Memory thread.** Generator + tests; integrated in `Flask.tsx` (streak →
  thread); `seed` plumbed through `FlaskFor`/`Flask` + callers. Previewed via artifact.
- [x] **Phase 1b — Thread revision (owner feedback).** Mixed styles *within one strand*
  (sharp/round/wiggly) + occasional loops/twists + per-node amplitude jitter (less
  regularity); a soft white halo makes the thread **shine**, amount driven by the Shine knob.
- [x] **Phase 2 — Colour spectrum.** `--flask-s/-l` tokens (light/dark); `FlaskColor` + channels
  helper in palette; hue `h<deg>` encode/parse in `icon.ts` (keys still work); `HueSpectrum`
  draggable slider; swapped into `FlaskPicker`; Flask + picker previews via the channels
  helper. Tests updated/added (126 passing).

## Owner feedback (round 1, on the preview artifact)
- Thread should shine a little, with the amount user-adjustable → wired to the Shine knob. ✓
- No twists/loops → added "O" loops. ✓
- Too regular (one style repeats) → per-segment style mix + jitter. ✓

## Notes
- Browser automation can't reach the dev server, so verify via build + render tests and the
  owner testing the native app.
