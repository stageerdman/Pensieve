# wiki — MAGICAL-FLASKS

Durable decisions and lessons from this update.

## Decisions
- **Flask = per-note icon (shape + colour), independent of categories.** Like Notion's page
  icon. Categories/tags are untouched; the small category-dot row behaviour stays (opt-in,
  default off) and now renders *after* the always-on flask. Flask is the note's visual identity.
- **One colour system.** Flask colours reuse the 9 `--cat-*` palette keys (resolved via CSS
  vars), so flasks are theme-correct in light + dark with no parallel hex table. Do not add a
  second colour set.
- **Default flask is a render-time fallback (`round-bottom`/`blue`), never persisted.** Plain
  notes stay plain in frontmatter (consistent with the existing "no metadata → no frontmatter"
  rule). A note only gets an `icon:` line once the owner picks one.
- **`icon` rides the existing metadata path.** frontmatter truth (`icon: shape/color`) →
  surfaced into `NoteMeta` for the sidebar → edited via `updateMeta`. No new plumbing; same
  shape as categories. Tauri `list()` already parses each note's frontmatter (for the excerpt),
  so the icon is read there — no `.meta.json` mirroring needed.
- **Magical colours = a *nudge*, not a reskin.** Body text stays AA+ and essentially as dark as
  before (hue pulled toward slate-blue); light surfaces go faintly cool; dark becomes a deep
  blue-black "stone". Accent moves toward the magical blue (`#8fb6ff` register in dark). The
  vivid magic lives in the flasks + the `--accent-glow` halo token, not in the reading text.

## Visual spec (flasks) — the keepers
- Fixed `0 0 24 30` viewBox, six silhouettes distinct by shape alone (colour repeats across
  notes, so silhouette carries recognition): round-bottom, erlenmeyer, vial, potion-bottle,
  teardrop, beaker (beaker is the only open/cork-less one).
- Draw stack: radial-gradient glow (NOT an SVG blur filter — blur janks a scrolling list),
  glass tint, clipped liquid gradient, meniscus, [bubbles], outline, [highlight], cork.
- `>= 20px` detail gate: below 20px drop bubbles/highlight/cork-band so the 16px row flask stays
  clean. `useId()` per instance (shared ids would cross-wire clipPaths/gradients) + `React.memo`.
- Cork + glass outline use `currentColor` (inherit) → legible on any surface, both themes.

## Lessons
- The `04-everyday-pensieve` concept is the owner's own "current app + magical nudge" reference
  (full light+dark palette). `04-apothecary` has the parametric flask generator worth stealing.
- Browser-automation (claude-in-chrome) could not attach to `localhost` here (site permission /
  interstitial; localStorage read was "Access is denied", screenshots "showing error page").
  Verify such UI via production build + testing-library render tests; have the owner eyeball the
  live dev server, or ship a self-contained gallery artifact (SVG reproduced) for visual sign-off.
