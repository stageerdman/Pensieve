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
    gesture layer is new. Build AFTER the owner device-tests the fixes below.
- Phase 3 fix round 2 (controls = the Dock): the Ship-1 bottom bar was STILL wrong — I hand-rolled a
  floating `position:absolute` cluster instead of the 4-cell Dock, and the collection's menu button
  didn't work. Fixed: `NoteActions` now renders the real `<Dock>` with a new `NOTE_DOCK` layout (gold
  Spell-Menu button cell 3 + Back collapsed spell in the ADJACENT cell 2 via a new `align:"end"`);
  collection menu button now uses the proven Dock→openMenu wiring. The 4-cell principle is written
  concretely into UX.md + memory [[phone-controls-bottom-standard]] + a dock-model adjacency test.

## Live status (2026-10-15, pausing — "finishing the job for now")
- Phase 1 (desktop): SHIPPED to main, owner-confirmed "looks good" + polish done (rune removed,
  lift-out gone, caption bottom). Dead code to clean in Phase 4: `galleryModel.galleryLayout`/
  `galleryColumns`, old `.pensieve-gallery-grid`/`-cover` CSS, old phone carousel CSS (`.ph-gallery-
  track`/`.ph-frame`/`.ph-dots`/long-press edit).
- Phase 2 (manual per-image reshape): DROPPED by owner.
- Phase 3 (phone saved-collection): BUILT + on main. Cover → full-screen masonry; "Photo" spell;
  Picture-button fix; write-under-images; controls now the 4-cell Dock (bottom) on memory + collection.
  **Awaiting the owner's device re-test** of the Dock placement + the collection menu button.
- Phase 3 Ship 2 (QUEUED, decisions locked): explicit "New gallery" spell (2nd conditional spell
  beside Photo) + phone drag (reorder-in-collection, move block to top, drag-image-into-gallery).
- Everything on `main`, pushed. Tests: full suite 747 + phone 132 green; desktop + `build:phone` clean.
- Resume: owner device-tests → then Ship 2 → then Phase 4 cleanup + close-out. Phone tested via
  `npm run dev:phone` (LAN, was 192.168.1.149:5174; DHCP-varies). Desktop app unaffected (no tauri
  rebuild needed for phone changes).
- NEXT: owner device-tests the phone (`npm run dev:phone`); then Phase 4 (cleanup of dead
  galleryLayout/old gallery CSS + the dropped-carousel CSS, docs, close-out) and merge/close.

## Live status (2026-10-16 — scroll fix, Back rune, drag-reorder, New-gallery spell)
- Scroll-jump fix: tap-below-to-write now fires on `click` not `onPointerDown`, so scrolling the
  memory page no longer yanks the keyboard up + focuses the trailing row. Owner-CONFIRMED, shipped.
- Back control made "magical": return-rune glyph + accent-blue (--conditional) glow (recedes vs the
  gold hero), no animation. Shipped.
- Phone DRAG-TO-REORDER photos in the collection: BUILT (long-press lift, drop-indicator bar,
  auto-scroll, data path controller.reorder + mediaDom reorderAt, 3 controller tests). Iterated
  twice on device (stable keys → position:fixed ghost to dodge the Safari multicol+transform bug)
  but owner reports STILL broken (right-column tiles vanish/jump on grab). DEFERRED by owner; logged
  in issues.txt with next ideas (ditch CSS column-count for an explicit JS 2-col layout).
- Ship-2 "NEW GALLERY" spell: DONE. Second conditional spell "Gallery" (2×2-grid glyph) beside
  "Photo" in the note ring; casts a picker that forces a fresh SEPARATE gallery block (insertImages
  `{newBlock:true}` skips adjacency-merge). Photo still merges as before. Tests updated (registry 2
  spells; mediaDom newBlock). 136 phone tests + build:phone clean.
- STILL QUEUED (Ship 2 remainder): block-level phone drag (move an image/gallery block up/down in
  the note; drag a single image onto a gallery to merge) — these are MORE touch-drag gestures, held
  until the collection reorder gesture/render is sorted (same multicol/gesture risk). Then Phase 4
  cleanup + close-out.

## Live status (2026-10-25 — owner bug report: 3 phone rendering gaps, all fixed)
- Owner reported, from the live device: (a) gallery images "saved horizontally" with no way to
  scroll through them, wanted vertical Pinterest scroll; (b) a resized/cropped image shows as raw
  ```pensieve:image``` code instead of a photo; (c) bullet lists show a literal `*` instead of a
  bullet.
- (a) **Investigated, no bug found**: the composite COVER → tap → full-screen vertical masonry
  (`PhoneCollection.tsx`, CSS `column-count:2`) already does exactly this, built in the 2026-10-16
  round above. The cover itself is a static (non-scrolling) preview tile by design — tapping it
  opens the vertical board. Likely either a stale installed PWA (pre-dated this round's
  `deploy:phone`) or the owner hadn't tried tapping the cover yet. Re-verify on device after this
  deploy; if still wrong, it's a NEW bug, not this one.
- (b) **Real bug, fixed**: desktop bridges a resized/cropped image through a `pensieve:image` fence
  (`src/lib/md/image.ts`) — the phone's `noteMedia.ts` only ever understood the `pensieve:gallery`
  fence, so a resized image fell through to a raw text block. Added full fence parse/encode
  (width/aspect/posX/posY, mirroring desktop's encode/reconstruct logic exactly) + `buildImageEl`
  now applies the width/crop when rendering. A note that merely passes through the phone keeps the
  desktop's sizing byte-for-byte.
- (c) **Real bug, fixed**: BlockNote's markdown exporter writes bullets as `* text`, numbered as
  `N. text`, checklists as `* [ ]`/`* [x] text` (2-space indent per nesting level) — the phone's
  note body treated every non-media line as flat escaped text, so the raw markdown leaked through
  visually. Added list-line parsing (`noteMedia.ts`: `matchListLine` + indent-stack tree builder)
  and DOM rendering (`mediaDom.ts`: real `<ul>/<ol>/<li>`, checklist via `data-checked` + a CSS
  glyph). Serialization walks ANY top-level `<ul>/<ol>` generically, so a list built with the
  toolbar's native `insertUnorderedList` round-trips the same way as one loaded from markdown —
  this was a latent round-trip gap on the write side too (textContent would have silently flattened
  a native list into one run-on line).
- Also fixed in passing: `stripMediaForPreview` (the reel snippet) didn't know about the
  `pensieve:image` fence either — now shows "📷 Photo" like every other image form.
- **Zoom** (owner asked to zoom into a lightbox photo): the lightbox's old comment said "pinch-zoom
  is the OS gesture" — untrue in practice, since `index.html`'s viewport is pinned to
  `maximum-scale=1.0` (required so double-tap stays free for word-selection elsewhere —
  `useWordSelection`). Rather than loosen the global viewport (risking that conflict), built a
  self-contained pinch + double-tap zoom + pan INSIDE `PhoneLightbox.tsx` (imperative CSS transform
  on the active frame's `<img>`, same pattern as the existing swipe-down-to-dismiss — no React
  re-render mid-gesture). Below 2x a single finger still drives the existing swipe-to-next/
  swipe-down-to-dismiss unchanged; above 1x it pans instead.
- Tests: +6 noteMedia (fence + list parse/serialize round-trips), +6 mediaDom (fence render + list
  render/serialize, incl. a native-`<ul>` round-trip). Full suite 992 passed, `tsc` (both apps) and
  `build:phone` clean. Zoom/pinch/pan is gesture code — per this file's own convention (see
  mediaDom.test.ts's comment), needs a device check; everything else is unit-verified.
- NEXT: owner device-tests this round (incl. re-confirming the cover→vertical-masonry tap, now that
  a fresh deploy is guaranteed current) + the zoom gesture feel. Then back to Ship-2 remainder +
  Phase 4 cleanup/close-out above.

## Live status (2026-10-26 — resumed after machine restart; drag-reorder Safari fix)
- Found uncommitted working-tree changes (survived the restart) implementing the deferred
  drag-reorder fix from `issues.txt`: `PhoneCollection.tsx` + `wand.css` swap the CSS
  `column-count:2` masonry for two explicit flex columns (items placed by index parity), which
  sidesteps the Safari multicol+transform bug class that was vanishing/jumping right-column
  tiles on grab. Also bundled: `li::marker` color fix (Safari ignores inherited text color on
  markers → invisible bullets in dark mode), and a sync-engine backfill (`engine.ts`) that
  rescans every local note's media refs each sync so a ref an older app version didn't
  recognize (e.g. the `pensieve:image` fence) self-heals without a destructive full restore.
- Verified: full suite 993 tests pass (1 unrelated flaky App.test.tsx timeout, green in
  isolation), both apps' `tsc --noEmit` clean. Committed `0ec44a9`, pushed to main, deployed via
  `npm run deploy:phone` (https://12d03185.pensieve-phone.pages.dev).
- NEXT: owner device-tests the drag-reorder gesture specifically (the thing this round targeted)
  — confirm right-column tiles no longer vanish/jump on grab. If good, close out the
  drag-to-reorder issue in `issues.txt`. Then: Ship-2 remainder (block-level move + drag-into-
  merge) + Phase 4 cleanup (dead `galleryLayout`/old gallery CSS) + close-out.

## Live status (2026-10-26, same day — owner device-tested, 3 gesture bugs still open + 1 real fix)
- Owner retested on device. Found via real content in the vault (not device-reported): a note
  whose first line was a bullet (`* Co tím myslíte?`) showed that literal marker baked into the
  phone's `<h1>` title — `titleFromMarkdown`/`splitTitleAndBody` only stripped heading marks (`#`),
  never list marks. **Fixed and shipped** (`728f1b7`, deployed): both now strip bullet/checklist/
  numbered marks too, same precedent as heading-demotion. This was the literal-asterisk bug the
  owner reported ("no bulletpoints... instead of *"). Confirmed against the real note.
  Sync self-heal (from the prior round) owner-CONFIRMED "worked perfectly".
- Drag-reorder fix (flex-column swap, above) did NOT resolve the symptom on device — owner says
  "reordering doesn't work there really." Third code-only attempt would risk the same outcome as
  the first two; logged in `issues.txt` with a recommendation to debug via Safari Web Inspector
  (real console/touch telemetry) rather than guess again.
- TWO more gesture bugs surfaced in the same collection/lightbox surface, both DEFERRED by owner
  explicitly ("not as important... log it, resolve later"):
  - Collection vertical scroll feels dead — unclear if real (needs retest with 10+ photos; a
    short list hitting its natural scroll-end can look identical to "stuck").
  - Lightbox swipe-left/right between photos has NEVER worked (confirmed by owner — not a
    regression from any recent round, a pre-existing unverified feature).
- NEXT (when owner picks this back up): a Safari Web Inspector session (iPhone plugged into the
  Mac) to get real telemetry on all three gesture issues at once, since static code review found
  no obvious blocker in any of them — same "looks correct in code, wrong on device" pattern as
  the earlier two failed reorder attempts.

## Live status (2026-10-26, later same day — the REAL root cause found)
- Found it, no Web Inspector session needed: `PhoneApp.tsx` has ONE global document-level
  `touchmove` guard (elastic-scroll prevention) with a hardcoded allowlist
  (`.reel`/`.note`/`.search-results`). The collection and lightbox are mounted as SIBLINGS of
  `.note` at the app root, so every touch inside them was silently `preventDefault()`'d by this
  guard — native scrolling blocked outright, swipe-to-next (which relies on native scroll-snap)
  killed before it ever reached the component. Shared root cause of the collection-scroll AND
  lightbox-swipe reports (and later the transcript reader's scroll, once that existed — see
  PHONE-AUDIO-TRANSCRIPT). Fixed `7503e2e`: added `.ph-lightbox,.ph-collection,.ph-reader` to the
  allowlist. See memory [[phone-global-touch-guard-allowlist]].
- The Safari multicol→flex fix (`0ec44a9`, above) was a real, separate bug and the correct fix
  for IT — it just wasn't the thing actually blocking scroll. Two prior reorder-specific attempts
  (stable keys, drag-ghost) also missed this because they were investigating the gallery's own
  code, not a global guard in an unrelated file.
- NEXT: owner retests drag-reorder, collection scroll, AND lightbox swipe now that the real
  blocker is gone — all three may just work now. If reorder is still broken after this, THAT
  would finally be a genuine component-level bug worth a Web Inspector session.
