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

## Lessons (2026-10-15)

### Desktop
- Natural aspect is DERIVED (`<img onLoad>` → component-local `url→aspect` map), never serialized —
  keeps the fence + the desktop↔phone byte-compat guard almost untouched. Only the dragged gallery
  HEIGHT persists (optional `h=<px>` fence header; round-tripped on BOTH stacks incl. phone's
  noteMedia + a guard fixture). The justified strip is a pure packer (`galleryJustify.ts`): dragged
  height → row count → shared rowH → per-tile width = aspect·rowH → `linearPartition` (order-
  preserving, balanced) → horizontal scroll. Height handle = live preview, commit once on release.

### Phone control standard — I BROKE IT TWICE (the expensive lesson)
The phone has ONE control language and it is STRICT; violating it reads as "broken" to the owner.
1. First I put the photo-collection's controls (close/count) at the TOP. WRONG — controls live at
   the BOTTOM.
2. Then I "fixed" it with a floating `position:absolute` bottom-right cluster (back + spell-fab).
   STILL WRONG — controls are not placed freely; they ARE the **4-cell Dock**.
The real rule (now in UX.md "Phone control standard" + memory [[phone-controls-bottom-standard]] +
a `dockModel` test): the Dock is a fixed 4-cell grid (`dockModel.ts`/`Dock.tsx`); the gold Spell-
Menu button sits in a cell (`menuSlot`, usually 3 = bottom-right); the rest = ONE expanded spell OR
up to 3 collapsed; a **Back is a collapsed spell in the cell ADJACENT to the menu** (`align:"end"`).
ALWAYS render `<Dock>` with a `DockLayout` (`HOME_DOCK`/`NOTE_DOCK`) — NEVER a bespoke cluster or a
top bar. A new overlay's controls = mount `<Dock>` + reuse `useSpellMenu` (the conditional ring).
Process lesson: before any phone UI, READ `dockModel.ts` + UX.md; don't infer the standard from the
surface you're looking at. The collection's dead menu button was the same root cause (not wired
through the Dock) — reusing the proven `<Dock>` path fixed placement AND the button at once.

### Phone misc
- iOS only opens the native file picker (`input.click()`) inside a TRUSTED, not-defaultPrevented
  gesture → the keyboard-toolbar Photo button must be a plain `onClick`, NOT the format keys'
  `onPointerDown`+`preventDefault` (that silently suppressed the sheet).
- Notion trailing text row: `renderNoteBody` appends an editable `<div>` after trailing media and a
  tap in the empty surface below drops the caret there (`caretToTrailingRow`); serialize trims it so
  it never persists until typed in. Also found/fixed: the phone DOM serializer (`serializeNoteBody`)
  was dropping the gallery `height` — now passes it to `galleryMd`.
- Phone is render-only over the SAME markdown model; desktop round-trip preserved (guard green).

## Sources
flickr/justified-layout (raw lib/row.js); react-photo-album.com/documentation; naver egjs-grid
JustifiedGrid; jaredLunde/masonic; paulhyunchong.com masonry; markus.is justified image grid;
moda.app + tailwindapp.com Pinterest board covers. (Full URLs in the Phase-0 research transcript.)
