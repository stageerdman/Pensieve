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
- [x] **Phase 1** — Data model: `FlaskShape` + `NoteIcon` types; `icon` in `NoteFields`/`Note`/`NoteMeta`;
  frontmatter encode/decode (`icon: shape/color`); store surfacing; `DEFAULT_ICON` fallback. Frontmatter tests.
- [x] **Phase 2** — Theme nudge in `src/index.css`, both themes (agent B's AA-checked values) + `--accent-glow`.
- [x] **Phase 3** — `Flask` reusable SVG component (agent A's six-shape spec) + `FlaskFor` helper.
- [x] **Phase 4** — `FlaskPicker` popover (shape grid + colour row + live preview) + `FlaskButton` trigger;
  integrated small/display in `NoteRow` and large/clickable above the editor in `App.tsx`. Wired to `updateMeta`.
- [x] **Phase 5** — Tests (84 pass) + production build clean. App runs without console errors.

## Live status
- 2026-10-05: ALL PHASES DONE. 84 tests pass, typecheck + prod build clean.
- Visual check: the Chrome automation extension cannot attach to `localhost` in this
  environment (site-permission/interstitial), so pixel-level verification was done via the
  production build + render tests, not a live screenshot. Dev server is up at
  http://localhost:5173 for the owner to view; a shareable flask/theme gallery can be produced.
- Next: merge to `main` + `npm run tauri:build` (standing owner preference) so the native app is testable.
