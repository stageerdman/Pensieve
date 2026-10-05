# Update v1 — FLASK-DEPTH

## Goal
Make the flasks richer and show them everywhere a note appears.
1. **Flask wherever a note is referenced** — the sidebar row (already) + the note header
   (already) + the `@`-mention inline in the text + the `@` suggestion menu + the relationships
   list (DetailsPanel).
2. **More fun in colour picking** — three expressive axes: **colour** (hue, the 9 palette keys),
   **vibrancy** (how rich/saturated the liquid is), **shine** (how glossy the glass is). Picked
   per note in the picker.
3. **Fill = content, not chosen.** How full the flask is reflects the note's content length:
   - title-only (one line) → **empty & colourless** glass.
   - up to ~5000 non-space content chars → the current **normal** look.
   - beyond ~5000 → **overfilled**, rising to the brim by ~10000.
   - gradual throughout.

## Decisions / interpretation
- Fill is computed from `contentCharCount` = non-space chars AFTER the title line (so a
  title-only note is genuinely 0). Surfaced into `NoteMeta.chars`; the open note uses its live
  markdown length so the header flask fills as you type.
- vibrancy/shine default to **0.5**, which reproduces the original flask pixel-for-pixel. Stored
  in the icon; frontmatter stays back-compatible: `shape/color` at default, `shape/color/vib/shine`
  (0–100) otherwise.
- vibrancy = liquid alpha richness (theme-correct, no per-row filter; one size-gated `saturate()`
  only at ≥40px). shine = glass gloss (highlight streak + meniscus crown + specular glint + cork
  sheen + rim light), all gated to ≥20px so 14px rows stay clean.
- Picker gains two 5-step segmented radiogroups (vibrancy, shine), reusing the roving-focus helper.

## Phased roadmap (built in one pass)
- [x] Plan + branch `update/flask-depth` + UX agent (picker + fill/vibrancy/shine visual spec).
- [x] Model: `NoteIcon` += vibrancy/shine; `fillForChars`; `contentCharCount`; 4-field frontmatter;
  `NoteMeta.chars` surfaced in both stores.
- [x] `Flask`: fill→per-shape liquid geometry, empty-fade + neutral tint, vibrancy alphas, shine gloss.
- [x] `FlaskPicker`: vibrancy + shine segmented controls + live preview.
- [x] Integration: RelationshipList flasks, `@` note-link inline flask (via a resolver), `@` menu icon.
- [x] Tests (99 pass) + prod build + native build.

## Live status
- 2026-10-05: Built end-to-end. 99 tests pass, typecheck + web build clean.
