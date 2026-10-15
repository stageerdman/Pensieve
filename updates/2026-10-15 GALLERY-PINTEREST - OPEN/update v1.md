# GALLERY-PINTEREST — update v1

## Goal
Make the inline gallery feel organic and Pinterest-inspired, with images keeping their **original
aspect ratios** by default.

- **Desktop:** a **horizontally-scrolling, justified** gallery. The user drags the gallery's
  **height**; that height drives how many rows images stack into and their size; images keep their
  ratios and spread out horizontally, scrolling sideways. Ratios are changeable manually per image.
- **Phone:** a Pinterest **"saved collection"** — the gallery shows as a single **composite cover**
  (one tile made of several images). Tapping it opens a full-screen **vertical masonry** scroll of
  all photos; closable at the top or via a special action. The note's conditional spell menu holds a
  single spell — **Upload photo** — and a **Go back** control sits in the note action bar next to the
  spell-menu button.

## Research (Phase 0 — DONE, see wiki.md for detail + sources)
- **Desktop algorithm = transpose of Flickr's justified-row math** (roll our own, ~60 lines, zero
  deps): from the dragged height derive `R` rows → one shared `rowH = (H − (R−1)·gap)/R` →
  `imgW_i = aspect_i · rowH` (ratio preserved) → distribute images across the R rows by **greedy
  shortest-row** packing → overflow scrolls horizontally. (Fallback lib if ever needed:
  `@egjs/grid` JustifiedGrid `horizontal:true`, MIT.)
- **Phone algorithm = column masonry** (shortest-column greedy, ~30 lines): fixed column width →
  `h_i = colW / aspect_i` → place each image in the currently-shortest column. Composite cover =
  hand-written CSS grid (1 big + 2 small, or 2×2). Roll our own (lightweight ethos) rather than add
  `masonic`.
- **Every layout needs each image's aspect ratio.** It is **derivable** (decode the blob /
  `img.naturalWidth/Height` on load), so we do NOT persist it in markdown — we backfill it at load.
  This keeps the `.md` format (and the desktop↔phone byte-compat guard) almost untouched.
- **Only genuinely new persisted datum: the desktop gallery HEIGHT.** Carried as an optional header
  line inside the existing `pensieve:gallery` fence (e.g. a leading `h=<px>` line); both desktop and
  phone round-trip it to stay byte-identical (phone ignores it for layout). Manual per-image ratio
  override (Phase 2) adds a per-image field only when a user actually reshapes a tile.

## Impact (from the two code-recon agents — see wiki.md)
- **Replace** the count-driven square grid (`galleryModel.galleryLayout`/`galleryColumns`, the ≤6
  cap + "+N more" cover) with an aspect+height packer. Rewrite tile hit-testing (`insertionIndexAt`)
  for a horizontal strip. **Keep** reorder/collapse/promote/merge/lift-out/extract data ops,
  `planImageInsert`, and the lightbox (`expand`/controller) verbatim.
- **Capture natural aspect** in `saveImageFile`/persist (decode the blob) + an `onImgLoad` backfill
  for legacy/external images; store `aspect?` on the runtime `GalleryImage` (not serialized).
- **Phone is render-only:** swap `renderGallery`'s carousel for a composite cover + a new full-screen
  masonry overlay (new controller + component mounted at app root, like `PhoneLightbox`). The
  `data-media` payload and `pensieve:gallery` output are untouched → desktop round-trip preserved.
- **Tests to update in lockstep:** desktop `gallery.test.ts`, `galleryModel.test.ts`,
  `galleryRoundTrip.test.tsx`, `insertGroup.test.ts`, `sharedFormat.guard.test.tsx` (only if the
  height header changes canonical bytes); phone `registry.test.ts` (roster), `mediaDom.test.ts`
  (structure). Keep `noteMedia.test.ts` (format guard) green.

## Phased roadmap
> **Phase 2 (manual per-image reshape) DROPPED (owner, 2026-10-15).** Natural ratios are the look;
> a per-tile ratio override isn't needed. The gallery `GalleryImage` stays `{url,caption}` (no
> per-image aspect in the fence); the desktop corner-reshape stays a single-image-only feature.

- **Phase 1 — Desktop ratio-preserving horizontal justified gallery.** Pure packer
  (`galleryJustify.ts`, unit-tested) + natural-aspect capture/backfill + horizontal-scroll render +
  draggable height handle (persisted via fence header) + horizontal reorder. Drop the +N cap. Keep
  lightbox/add/merge/extract/collapse.
- **Phase 2 — Desktop manual per-image ratio override.** Reshape a single tile (mirror the single
  image's `aspect` semantics); persist per-image only when overridden.
- **Phase 3 — Phone "saved collection".** Composite cover render + full-screen vertical masonry
  overlay (close-at-top + swipe/Esc) + reduce note conditional spells to a single "Upload photo" +
  "Go back" control beside the spell-menu button. Render-only; markdown byte-compat preserved.
- **Phase 4 — Polish, a11y, docs, close-out.**

## Decisions needed (before build) — see the chat question
1. **Scope/sequencing:** ship Desktop (Phase 1[+2]) first for a device test, then Phone — or build
   desktop + phone together this round?
2. **Manual per-image resize:** natural ratios + draggable height now, manual per-image override as a
   fast follow (Phase 2) — or include the per-image override in the first desktop drop?

## Decisions (locked 2026-10-15)
- **Desktop first**, then phone (verify each surface before moving on).
- **Manual per-image reshape = Phase 2 fast-follow.** Phase 1 = natural ratios + draggable height.
- Natural aspect: NOT serialized — kept in a component-local `url→aspect` map filled on `<img onLoad>`
  (no block/doc mutation, so no false dirty). Only the gallery HEIGHT persists (fence `h=` header).
- Desktop rows use **linear partition** (order-preserving, balanced) not greedy shortest-row, so the
  user's tile order reads left-to-right, top-to-bottom.

## Live status
- Phase 0 research: DONE. Decisions locked.
- Phase 1 (desktop): BUILT, awaiting owner device test. Shipped:
  - `galleryJustify.ts` pure packer (11 tests); `height` prop + fence `h=` header round-trip
    (desktop + phone byte-compat, guard fixture); justified horizontal-strip render with
    `<img onLoad>` aspect capture (local, unserialized); draggable bottom height handle
    (commit-once → fence); 2D reorder; dropped the +N cap. 745 tests pass.
  - Dead code left for Phase 4 cleanup: `galleryModel.galleryLayout`/`galleryColumns` (no longer
    used by the render) + the old `.pensieve-gallery-grid`/`-cover` CSS.
- Phase 1 polish (owner feedback): per-image sync rune removed everywhere (gallery + single image;
  deleted MediaRune/useMediaBackup), "Lift out" button gone, caption dropped to the image bottom,
  stuck drop-ring guard. Desktop rebuilt + installed.
- Phase 3 (phone) — owner chose phone as the next phase (Phase 2 manual-reshape deferred). BUILT,
  awaiting device test via `npm run dev:phone`. Shipped (render-only, markdown byte-compat kept):
  - Composite COVER (1 big + ≤2 small + "+N") replaces the carousel; tap → full-screen COLLECTION
    overlay (CSS-columns vertical masonry, close X/swipe-down/Esc, tap→lightbox, × to remove).
    New collectionController + PhoneCollection at app root. Removed carousel + long-press reorder.
  - Note conditional spells → single "Upload photo"; "Go back" moved into the top-right action
    cluster next to the Spell Menu opener.
- Phase 2 (manual per-image reshape): DROPPED by owner — natural ratios are the look.
- Phase 3 phone — owner device test found: (a) I put collection controls on TOP = broke the phone
  control standard (controls ALWAYS bottom via the Spell Menu; now written into UX.md + memory
  [[phone-controls-bottom-standard]]); (b) keyboard-toolbar Picture did nothing; (c) wanted memory +
  collection controls at the bottom (Back next to the Spell Menu opener, Conditional "Photo" spell,
  rotating); (d) write under images. **Ship 1 (DONE, awaiting device test):** NoteActions bottom bar
  on memory + collection; "Photo" spell; Picture onClick fix; collection "Photo" adds to that gallery;
  Notion trailing text row + tap-below; collection z 170→145; fixed phone serializer dropping gallery
  height.
- **Ship 2 (queued, owner decisions locked):**
  - **"New gallery" = an explicit action** → add a second conditional spell "Gallery" (alongside
    "Photo") that starts a gallery to fill (multi-pick → a gallery block).
  - Phone drag/move (all three): **reorder photos within the collection** (drag tiles), **move a
    gallery/image block** up/down among the note's blocks (DOM sibling reorder), and **drag an image
    onto a gallery to merge** it in. Reuse `reorderImages` + `mergeInto` (data ops intact); the
    gesture layer is new. Build AFTER the owner device-tests Ship 1.
- NEXT: owner device-tests the phone (`npm run dev:phone`); then Phase 4 (cleanup of dead
  galleryLayout/old gallery CSS + the dropped-carousel CSS, docs, close-out) and merge/close.
