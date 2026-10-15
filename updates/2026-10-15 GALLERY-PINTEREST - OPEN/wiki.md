# GALLERY-PINTEREST — wiki (durable decisions & research)

Pinterest-inspired gallery: desktop = horizontal justified (height-driven), phone = saved-collection
cover → full-screen vertical masonry. Follows MEDIA-IMAGES (the gallery already exists as an inline
`imageGroup` block serialized to a `pensieve:gallery` fence).

## Algorithm research (web, 2026-10-15 — sources at bottom)

### Desktop: horizontal justified (roll our own — transpose of Flickr's row math)
Flickr/Google justified rows fix a row HEIGHT and solve width:
`rowHeight = (containerWidth − (n−1)·gap) / Σ(w_i/h_i)`, `imgW_i = aspect_i · rowHeight`.
Our spec is the transpose — a fixed container HEIGHT (user-dragged) drives the row COUNT, images
flow horizontally, container scrolls sideways:
```
R     = clamp(round(containerHeight / targetRowH), 1, maxRows)   // targetRowH ≈ 180–260px band
rowH  = (containerHeight − (R−1)·gap) / R                         // exact, fills the height
imgW_i = aspect_i · rowH                                          // ratio preserved; only width varies
// distribute images across R rows by GREEDY SHORTEST-ROW (append each to the row with the
// smallest running width) → balanced ragged right edge, minimal horizontal scroll length.
```
Greedy is O(n), organic, matches Flickr's family. Optional upgrade: DP "linear partition" for a
provably even right edge (react-photo-album uses Knuth–Plass line-breaking). Flickr's own
`justified-layout` lib is vertical-only → not usable for the horizontal orientation; `@egjs/grid`
JustifiedGrid `horizontal:true` (MIT) is the only off-the-shelf lib that does it — kept as a fallback.

### Phone: vertical masonry (roll our own — shortest-column greedy)
```
colW = (containerWidth − (C−1)·gap) / C        // C ≈ 2 on phones
for each image in order:
  h_i = colW / aspect_i                        // scaled to fixed column width, ratio preserved
  k   = indexOfMinHeight(colHeights)           // shortest column
  place at (k·(colW+gap), colHeights[k]); colHeights[k] += h_i + gap
```
Masonry = every image same WIDTH, height varies (opposite of justified). Libraries (`masonic` —
MIT, ~5KB, virtualized; `react-masonry-css`) do exactly this; we roll it (lightweight ethos, boards
are small). Composite cover = CSS grid (`grid-template-columns: 2fr 1fr` with the right column split
into two rows, each cell `object-fit:cover`), first 1/3/4 photos as cover tiles.

### Per-image dimensions
Both layouts need each image's aspect = naturalW/naturalH BEFORE layout. It is derivable, so we do
NOT persist it: capture at ingest (`createImageBitmap(blob)` in `saveImageFile`) and backfill via
`<img onLoad>` for legacy/external images. (No SQLite in this project — the research's "store in
SQLite" advice is replaced by this derive-and-backfill approach.)

### Libraries evaluated / avoided
MIT & fit: `@egjs/grid` (both orientations), `masonic` (phone masonry), `yet-another-react-lightbox`
(we already have our own lightbox, so skip). AVOID: `react-grid-gallery` (EOL Aug 2025), Isotope
(GPL/commercial, not MIT), any jQuery gallery.

## Format decision (back-compat)
- **Natural aspect: NOT serialized** (derived on load). Old galleries parse unchanged.
- **Gallery height: an optional `h=<px>` header line inside the `pensieve:gallery` fence**, round-
  tripped by BOTH desktop (`gallery.ts`) and phone (`noteMedia.ts`) so the byte-compat guard
  (`sharedFormat.guard.test.tsx`) stays green (phone ignores it for layout). Absent → auto height.
- **Manual per-image override (Phase 2): a per-image field only when a tile is reshaped** (mirrors
  the single image's `aspect` semantics: 0 = natural, >0 = explicit). Carried without breaking the
  first-`" | "` caption split (exact encoding TBD at Phase 2 — ref-suffix `#ar=` or a typed trailing
  token; must stay lockstep desktop↔phone + update guard fixtures).

## What stays (do NOT rebuild)
Lightbox controller + `expand`; reorder/collapse/promote/merge/lift-out/extract data ops;
`planImageInsert`; the `imageGroup` block's single `images` JSON prop; phone `noteMedia.ts`
parse/serialize + `mediaStore.ts` (phone is render-only). ProseMirror/WKWebView event rules from
MEDIA-IMAGES still apply (native mousedown for drag handles, pointer-based drag, build-before-native).

## Sources
flickr/justified-layout (raw lib/row.js); react-photo-album.com/documentation; naver egjs-grid
JustifiedGrid; jaredLunde/masonic; paulhyunchong.com masonry; markus.is justified image grid;
moda.app + tailwindapp.com Pinterest board covers. (Full URLs in the Phase-0 research transcript.)
