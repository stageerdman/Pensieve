# wiki — FLASK-DEPTH

## Durable decisions
- **Fill is content-driven, never stored.** `NoteIcon` holds identity (shape/colour/vibrancy/shine);
  fill is computed from `contentCharCount` and passed to `<Flask fill>`. Keeps the icon stable while
  the flask visibly "fills up" as a note grows. Anchor: `NORMAL_FILL=0.8` at `NORMAL_CHARS=5000`,
  brim (1.0) by `OVERFILL_CHARS=10000`, concave below normal (`pow(n/N,0.7)`) so short notes still
  read as holding something. Title-only ⇒ 0 ⇒ empty, colourless glass.
- **vibrancy/shine anchored at 0.5 = the original look.** So adding the axes regressed nothing. Both
  are pure opacity maths over the existing `--cat-*-fg` token — the hue/sat never leave the CSS var,
  so light/dark still auto-switch. No parallel colour table.
- **No per-row filters.** vibrancy rides alpha; the only `filter` is a single `saturate()` gated to
  `size>=40` (header/picker preview, never list rows). shine overlays are `#fff` opacity, gated to
  `size>=20`, so 14px rows stay clean and cheap.
- **Flask shown wherever a note appears.** Row, header, relationships list, `@` suggestion menu, and
  the inline `@` note-link in the text. The inline link resolves the target note's live flask via a
  module-level `setNoteLinkResolve` the Editor keeps current (same pattern as `setNoteLinkOpen`).

## Lessons
- The content char count is free to compute in `store.list()` on Tauri because `list()` already reads
  each note's file for the excerpt — parse once, derive excerpt + chars together.
- BlockNote's suggestion-menu item supports an `icon` ReactNode, so the `@` menu flask is a one-liner.
- Picker taste-knobs as 5-step segmented radiogroups (not native range inputs) reuse the existing
  roving-focus `step()` helper and dodge cross-browser slider-thumb styling — calmer and less code.
- Committing vibrancy/shine only on click/Enter (focus just moves) avoids a disk write per arrow key.
