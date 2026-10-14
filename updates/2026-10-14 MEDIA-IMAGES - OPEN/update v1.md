# MEDIA-IMAGES — update v1

**Goal:** Ship the first media modality — **images** — inline in notes, local-first, loaded
instantly, backed up to OneDrive, and capturable on both desktop and phone. Single images and an
inline **gallery** (multiple images in one block). Audio/video, `@`-referencing media, and
time-point refs are FUTURE — we design the seams, we don't build them.

Grounding: `design.md` / `UX.md` / `VISION.md`; full technical recon + the synthesized 4-agent UX
model live in `wiki.md` (read it — the UX decisions and cut list are there, not repeated here).

## The model in one breath
Media → `vault/media/<noteId>/<mediaId>.<ext>` (original kept, `mediaId` is a stable minted id).
In-memory reference = `{ mediaId, kind:'image', caption?, width?, timecode? }` (kind/timecode unused
but present — the future seam). Single image serializes as plain `![caption](media/<noteId>/<mediaId>.<ext>)`;
a gallery as a `pensieve:gallery` fenced block (one ref per line) via `lib/md/extended.ts`. Load
rewrites refs → fast local asset URLs (Tauri `convertFileSrc` / phone IndexedDB blob URLs); save
rewrites back. One `MediaBlock` visual base across single/gallery/phone. One magical moment: the
lightbox (reuses `PreviewPortal`'s language at z-30). States follow **absence = healthy**; a `gold`
sync rune marks not-yet-backed-up and fades once safe.

## Module layout (avoid the `features/gallery/` name clash — that's the flask overview)
- `src-tauri/src/lib.rs` — new binary FS commands.
- `src/lib/media/` — ref model, mediaId minting, ref↔URL rewrite, store glue.
- `src/components/editor/media/` — `MediaBlock`, `ImageBlock` (surface BlockNote's), `ImageGroupBlock`
  (the "gallery"), `/image` wiring, paste/drop handlers.
- Lightbox — reuse / extend `src/features/gallery/PreviewPortal.tsx` + `index.css` (do NOT author a
  new overlay language); expose a shared opener usable by editor + phone.
- `phone/src/...` — Picture spell, NoteToolbar button, file input, imperative media render + fence renderer.
- `src/lib/sync/{adapter,engine}.ts` — binary backup.

---

## Phased roadmap
Build mode: auto-build end to end, phase by phase; commit + push + verify each phase; check in only
on a real decision/blocker. Each phase is independently verifiable.

### Phase 0 — Foundations: bytes on disk + the reference model  ✅ (built 2026-10-14, pending owner native-app run)
- Rust: `write_bytes(rel, data)` + `read_bytes(rel) -> Option<Vec<u8>>` in `lib.rs` (model on
  `write_text`, reuse `resolve`, register in `invoke_handler!`). Decide base64-over-invoke vs raw.
- Tauri `convertFileSrc` asset protocol: add the vault dir to the asset scope in `tauri.conf.json`;
  prove a saved image loads via an asset URL.
- `src/lib/media/`: `mediaId` minting; path builder `media/<noteId>/<mediaId>.<ext>`; the typed
  reference object; `saveMedia(noteId, bytes, ext) → ref`; `resolveRef(ref) → url`; ref↔URL rewrite
  helpers used by load/save.
- `Store` interface (+ Tauri and Browser adapters) gains media methods. Browser/phone adapter stores
  bytes in **IndexedDB** (not base64 in localStorage), resolves to blob URLs.
- Tests: save→resolve round-trip; path-traversal guard; ref↔URL rewrite is lossless.
- **Verify:** unit tests green; a scripted save+load of a real PNG in the native app.

### Phase 1 — Desktop single image (the core moment)  ✅ (built 2026-10-14, pending owner native-app run)
- Surface BlockNote's image block as a `MediaBlock`-styled render; wire `uploadFile` → `saveMedia`.
- `/image` (`/img`,`/photo`) slash item (mirror the `@` `SuggestionMenuController`): inline one-input
  block — URL+Enter embeds, Enter-on-empty opens OS picker. **No Upload|Embed|Search tabs; delete web search.**
- Cmd+V paste handler + drag-drop (via `_tiptapOptions.extensions` `handlePaste`/drop; model on
  `blockSelectionDecorations.ts`). Calm full-editor `accent-glow` drop ring + insertion caret.
- Markdown round-trip: single image `![caption](media/…)`, caption=alt; width hint via the
  extended-md `pensieve:*` bridge. Respect `loadBlocksWithoutHistory`/`loading`-ref contract.
- Behaviors: width resize snaps 25/50/75/100% (`Cmd+[`/`Cmd+]`), caption field, Replace/Remove in the
  gutter menu. Default 75% col, left-aligned, block-level only; tall images max-h ~60vh.
- States: loading shimmer, saving `accent` hairline, broken/missing (keep rect + filename + Locate).
- Tests: md round-trip incl. caption+width; paste inserts a block; broken-file render; undo-load regression still green.
- **Verify:** native app — paste a screenshot, `/image` a URL, drag a file, reload and confirm it loads.

### Phase 2 — The lightbox (shared magic)  ✅ (built 2026-10-14, pending owner native-app run)
- Extend `PreviewPortal` into a shared image lightbox at z-30 (blur+darken+water-sway already there);
  add shared-element expand-from-rect if cheap, `prefers-reduced-motion` → cut.
- Wire single image → `Space`/`Enter`/click opens; Esc/backdrop/close closes; focus returns to tile.
- Tests: open/close, focus trap + restore, reduced-motion path.
- **Verify:** native app — expand a single image, keyboard + mouse.
- BUILT: did NOT extend PreviewPortal (it's note-markdown-specific) — built a standalone
  `src/components/media/ImageLightbox.tsx` that **reuses PreviewPortal's CSS language** and a
  module-level `lightboxController.ts` (open/close/subscribe) callable from outside React.
  API `open({ items, index, originRect?, originElement? })` is one-OR-many from day one (arrows +
  "n / N" counter hide at length 1), so Phase 3 passes a gallery with zero rework. 7 new tests.

### Phase 3 — Desktop inline gallery (`ImageGroupBlock`)  ✅ (built 2026-10-14, pending owner native-app run)
- `createReactBlockSpec` `ImageGroupBlock` (template: `noteLink.tsx`); register in `editorSchema.ts`.
- Emergent gallery: multi-paste/drop/pick → one group; adjacency-merge at creation; drop-onto joins;
  1↔2 collapse/promote (fence ↔ plain `![]()`).
- Count-driven layout: 1 plain · 2 two-col · 3 three-col · 4 2×2 · 5–8 justified 3/row · 9+ capped 6 +
  "+N more" (opens lightbox at 7). `gap-1` tiles, outer `rounded-lg`/inner `rounded`, max ~2 rows (~340px).
- Inline edit: drag-reorder (accent insertion line), × remove (⌘Z undo, file kept), "+" add tile,
  per-image lazy caption, "Lift out" to extract. No per-gallery title, no layout chooser.
- `pensieve:gallery` fence in `extended.ts` (`encode/reconstructStructure` via `fence()`/`langOf()`);
  order = line order. Lightbox gains sibling nav (←/→, Home/End, "7/12" counter — **no filmstrip v1**).
- Tests: gallery md round-trip; merge/collapse/promote; reorder → line reorder; partial-upload state.
- **Verify:** native app — drop 3 images, reorder, add, remove to 1 (collapses), expand + arrow through.

### Phase 4 — Phone image capture  ✅ (built 2026-10-14, pending owner device run)
- Make the spell context note-aware (replace hardcoded `useSpellMenu("home")` at `PhoneApp.tsx:160`).
- `image` IconName + glyph; **"Picture"** spell leading `conditionalSpells("note")` + dispatch.
- NoteToolbar image button left of the mic + `onInsertImage` (pointerdown+preventDefault; NOT a `FmtKey`).
- Hidden `<input type=file accept="image/*" multiple>` (no `capture` attr) → native iOS sheet.
- Imperative insert of non-editable image/group blocks into the contentEditable; **minimal fenced-block
  renderer** so desktop-made galleries don't show as raw text. Object-URL instant + background IndexedDB save.
- Swipe carousel + page dots for groups; tap → lightbox (OS pinch); long-press reorder/remove; collapse-to-single.
- Extend phone `Note` type + `seed.ts` + `useAutosave.ts` for media; serialize to the SAME markdown model.
- **Verify:** `npm run dev:phone` on the owner's iPhone — add from library, take a photo, multi-select → carousel, reopen.

### Phase 5 — OneDrive binary backup  ✅ (built 2026-10-14, pending owner native-app run)
- Adapter: media remote path scheme + binary upload/download (not a string body); loosen the `.md`-only
  filters; keyed on `mediaId`. Engine enumerates media alongside notes (`engine.ts` push/pull loops).
- `gold` sync-rune states on `MediaBlock`: held-local → backing-up (pulse) → backed-up (fades) →
  failed (`warn` + one toast, auto-retry). StatusWhisper aggregates.
- Tests: media enumerated + PUT; delta pulls media; restore on a second vault rehydrates images.
- **Verify:** native app — add an image, watch it back up (rune fades), confirm the binary in OneDrive.
- BUILT: `http_request` grew a binary path (base64 body + opt-in base64 response); the note/JSON
  string path is byte-identical. Adapter gained `uploadMedia`/`downloadMedia` + a nested remote
  scheme `<root>/media/<noteId>/<id>.<ext>` + `mediaRefFromItem`. Engine pushes not-yet-backed-up
  local media (content-addressed — a recorded ref = done; failures retried, never thrown) and pulls
  the media a pulled/restored note references. `SyncState.media` records backup; a framework-light
  `backupStatus` store drives the gold rune on every image + the aggregate whisper/toast. `tsc`
  clean; Vitest **677** (653 prior + 24 new); `cargo test` 3/3.

### Phase 6 — Polish, docs, close-out  ✅ (built 2026-10-14, done-pending-owner-verification)
- Full states-matrix + a11y pass (focus rings, keyboard contract, alt=caption, reduced-motion, both themes).
- **Do NOT add media garbage-collection** (timeline/version snapshots may reference removed images) —
  note it as a deliberate deferral.
- Docs: tick ROADMAP `IMAGES`; update `issues.txt`; fix CLAUDE.md "TipTap"→BlockNote reality; add the
  media module(s) to `STRUCTURE.md`. Record lessons in `wiki.md`.
- Merge to `main` + `npm run tauri:build` so the owner can test the native app (per standing rule).
  Rename folder `- OPEN` → `- CLOSED`; prune the branch.
- BUILT: **Shared-format guard** — `src/components/editor/media/sharedFormat.guard.test.tsx` locks the
  desktop (real editor + our schema) and phone (pure string) implementations to byte-identical
  serialize + identical parse over a canonical fixture set; the two **agreed with zero fixes**.
  **A11y pass** found keyboard + reduced-motion already complete; the one gap was `alt=""` on
  uncaptioned images → added `mediaAlt()` (caption, else a non-blob "Image") on all 5 surfaces, with
  tests. **Docs**: CLAUDE.md "TipTap"→BlockNote 0.55; ROADMAP `IMAGES` ticked; issues.txt
  MEDIA-IMAGES section (shipped + the deferrals); STRUCTURE.md media modules; wiki.md Phase-6 +
  durable cross-phase lessons. **Merge / `tauri:build` / folder rename are the orchestrator's** (not
  done here). `tsc` + phone `tsc` clean; Vitest **689** green (677 prior + 12 new: guard 7, MediaBlock
  a11y 1, alt helper 2, phone mediaDom a11y 2); `cargo check` clean. Owner verification consolidated
  below.

---

## Live status
- **2026-10-14** — Update opened. Recon done (editor=BlockNote 0.55, storage, phone, sync all mapped).
  Three decisions locked with the owner (inline gallery block · backup in scope · full phone UX now).
  4-agent Steve-Jobs UX team run + synthesized into `wiki.md`. Plan written.
- **2026-10-14** — **Phase 0 built.** Rust `write_bytes`/`read_bytes` (base64 over invoke) +
  `protocol-asset` feature + asset-protocol scope `$APPDATA/vault/media/**`; `src/lib/media/`
  (id mint · ref model `{mediaId,kind,caption?,width?,timecode?}` · path builder · base64 · ref↔URL
  registry); `Store` gains `saveMedia`/`loadMediaUrl`/`removeMedia` in both adapters (Tauri→disk via
  base64 + `convertFileSrc`; Browser→IndexedDB blob store, injectable for tests). `tsc` clean,
  `cargo test` 2/2 green, full Vitest 577/577 green. **Pending owner native-app run** to confirm a saved
  PNG actually loads via its asset URL (browser automation can't reach the dev server — repo memory).
  **Next: Phase 1 (desktop single image) — do NOT start without go-ahead.**

- **2026-10-14** — **Phase 1 built.** Desktop single image shipped behind the Phase-0 flow.
  A custom `image` block (createReactBlockSpec) **replaces** BlockNote's built-in image so it
  renders in the MediaBlock language; `parse(<img>)`+`toExternalHTML(<img>)` make a default-
  width image round-trip natively as plain `![caption](media/…)`, a non-default width rides a
  `pensieve:image` fence (`lib/md/image.ts`). One save funnel (uploadFile · `/image` · paste ·
  drop) → saveMedia+resolveMediaUrl, instant object-URL then swap. Width resize (25/50/75/100,
  `Cmd+[`/`]`), caption=alt, Replace/Remove, `Space`→`onExpand` stub. States: loading shimmer,
  saving accent hairline, broken-keeps-rect+filename+Locate. `tsc` clean; full Vitest **602**
  green (577 prior + 25 new: bridge 11, round-trip 5, MediaBlock 4, insert 5); undoLoad still
  green. **Pending owner native-app run** (paste a screenshot, `/image` a URL, drag a file,
  reload → image loads via its asset URL). **Next: Phase 2 (lightbox) — do NOT start without go-ahead.**

- **2026-10-14** — **Phase 2 built.** The shared lightbox — the one magical moment. A
  module-level `lightboxController` (open/close/subscribe) + one `<ImageLightbox/>` at the app
  root (`App.tsx`, beside `StatusWhisper`), portalled to `document.body` at **z-30** (below z-40
  modal / z-50 toast, so a StatusWhisper still surfaces over it). Opener API shaped for one OR
  many: `open({ items:{url,caption?}[], index, originRect?, originElement? })` — a single image is
  a one-item list; arrows (`←`/`→`), `Home`/`End`, chevron IconButtons and the quiet "n / N"
  counter all hide at length 1 → Phase 3 passes a gallery with **zero rework**. Reuses
  PreviewPortal's CSS **verbatim** (`focus-backdrop`/`portal-halo`/`portal-water`) — did NOT
  extend PreviewPortal (it renders note markdown, not an image). Rect→centre **FLIP travel**
  (~200ms ease-out, collapse reverses it); `prefers-reduced-motion` or no origin rect →
  `portal-enter` cross-fade/cut. Dismiss: Esc / backdrop / close IconButton; `role="dialog"` +
  `aria-modal`, focus trapped on open and **restored to the originating element** on close.
  `IconButton` gained `forwardRef` + an AA `focus-visible` accent ring; new ChevronLeft/Right
  icons. `tsc` clean; full Vitest **609** green (602 prior + 7 new); PreviewPortal/home-preview
  untouched (no regression). **Pending owner native-app run** (travel feel, backdrop blur +
  water-light in light/dark, Space-to-expand from a real image). **Next: Phase 3 (gallery) — do
  NOT start without go-ahead.**

- **2026-10-14** — **Phase 3 built.** The desktop inline gallery — `ImageGroupBlock`
  (createReactBlockSpec, registered `imageGroup` in editorSchema). A count-driven grid of
  tiles that **reuse the MediaBlock CSS language** (not the component — tiles are
  object-fit:cover with no per-tile width/caption-below, so this mirrors the lightbox's
  "reuse CSS, not component" call): 2→2col, 3→3col, 4→2×2, 5–8→3/row, 9+→capped at 6 with a
  "+N more" cover opening the lightbox at the covered image. `gap-1` / inner `rounded` /
  outer `rounded-lg`, ≤2 rows (~340px), no shadows. Inline edit: pointer drag-reorder
  (accent insertion line; reorder = line reorder), × remove (⌘Z-undoable, **file kept on
  disk**, 2→1 **collapses** to a single ImageBlock), persistent "+" add tile, lazy per-tile
  caption, "Lift out". Every tile click/Space → the Phase-2 lightbox with the WHOLE gallery
  + that index. **Emergent creation** (`insertGroup.ts`, above insertImage's save funnel):
  2+ images in one gesture → a group; drop-onto / adjacency → merge (promoting a single
  image to a group); 1 → the single-image path — Editor routes paste/drop here,
  imagePasteDrop untouched. `pensieve:gallery` fence (one `ref | caption` line per image,
  order = line order) in `lib/md/gallery.ts`, load-time ref resolution folded into the
  existing bridge walk. `tsc` clean; full Vitest **637** green (609 prior + 28 new: bridge
  8, model 11, real-editor round-trip 3, orchestration 6).
  **Pending owner native-app run** (the layouts at each count, drag-reorder feel,
  "+N more"→lightbox, drop-onto join rail — none are browser-verifiable). **Next: Phase 4
  (phone) — do NOT start without go-ahead.**

- **2026-10-14** — **Phase 4 built.** Phone image capture, in the phone's own idiom
  (uncontrolled contentEditable, no BlockNote). Two reach-points, one picker, the SAME
  markdown model as desktop. **(A)** a "Picture" spell leading `conditionalSpells("note")`
  (new `image` IconName + single-stroke photo glyph); the hardcoded `useSpellMenu("home")`
  is now note-aware, and a quiet gold spell-opener was added to the note-top so the
  note-conditional ring is reachable from an open memory (it wasn't before — `.note` z140
  covers the dock z134). **(B)** a photo button in NoteToolbar left of the mic (a dedicated
  `onInsertImage`, pointerdown+preventDefault, NOT a FmtKey). Both click one hidden
  `<input type=file accept=image/* multiple>` (no `capture` → native iOS sheet). Media are
  **non-editable DOM blocks** mutated imperatively on the body ref (never via React), carrying
  their payload in `data-media` so the body serializes back to `![](ref)` / `pensieve:gallery`.
  Single image = figure; 2+ or adjacency-merge = a scroll-snap **carousel + page dots**; tap →
  a full-screen **PhoneLightbox** (swipe between members, swipe-down/backdrop dismiss, OS
  pinch); long-press a gallery → edit mode (quiet Remove + drag-reorder); 2→1 collapses to a
  single image. Bytes go to a phone-local **IndexedDB** store (object-URL instant, write in the
  background); the vault now persists to **localStorage** so a photo survives a reload. A
  desktop-authored `pensieve:gallery` renders as a carousel (seeded demo note, offline SVG
  data URIs). New phone-local `lib/media/` (noteMedia bridge, mediaStore, lightboxController)
  — kept phone-local because the desktop `lib/md`/`lib/media` drag the Tauri store chain and
  the two apps are decoupled (shared tokens only). `tsc -p phone` + root `tsc` clean; phone
  `vite build` clean; full Vitest **653** green (637 prior + 16 new: noteMedia 12, mediaDom 4;
  registry/PhoneApp assertions updated for the new spell + the 13th seed note).
  **Pending owner device run** (`npm run dev:phone` on the iPhone — see the checklist below).
  **Next: Phase 5 (OneDrive binary backup) — do NOT start without go-ahead.**

- **2026-10-14** — **Phase 5 built.** OneDrive binary backup for desktop image media (phone
  sync stays deferred to PWA-CAPTURE). The native `http_request` could only carry a JS string,
  so it gained a binary path: an optional base64 request body (decoded to bytes before send)
  and an opt-in base64 response (raw bytes read back, base64'd) — `serde(rename_all=camelCase)`
  keeps the single-word fields (method/url/headers/body) identical, so the note/.md/token/JSON
  path is untouched. `graph.ts`'s transport grew `binaryBody`/`binaryResponse` flags (Uint8Array
  body → base64 over the bridge; binary response → a bytes-backed `Response`); the browser/test
  path handles bytes natively. The adapter got a nested remote scheme
  `<root>/media/<noteId>/<id>.<ext>` (Graph path addressing auto-creates the folders on the PUT),
  `uploadMedia` (binary PUT, content-type by ext) / `downloadMedia` (binary GET), and
  `mediaRefFromItem` (recognise a media binary by parent-path + name so it's never misread as a
  note — the `.md` filters are unchanged because a `.png` already fails `noteIdFromName`). The
  engine enumerates local media (`vault.listMedia` walks `media/<noteId>/*`) and pushes any ref
  not yet recorded as backed up (content-addressed, immutable bytes → a present remote copy = done;
  a failed image is recorded + retried next sync, never thrown so it can't abort the note sync),
  and pulls the media a pulled/restored note references (`extractMediaRefs` over the `.md`) so a
  second machine / `restoreFromCloud` rehydrates images. `SyncState.media` records
  `{remoteId?, backedUp, failedAt?}`. A framework-light module-level `backupStatus` store
  (`local → uploading → backed-up → failed`, **absence = healthy**) is updated per ref by the
  engine, seeded from `SyncState` on mount, and gated on the connection; `MediaBlock` + gallery
  tiles render the **gold rune** from it via `useMediaBackup`, and one `MediaBackupWhisper`
  aggregates ("Backing up N images…" + one failure toast). `tsc` clean; Vitest **677** (653 prior
  + 24 new: adapter.media 7, engine.media 5, backupStatus 7, extractMediaRefs 2, vault media 3);
  `cargo test` 3/3. **Pending owner native-app run** (see the Phase 5 checklist below).
  **Next: Phase 6 (polish/close-out) — do NOT start without go-ahead.**

- **2026-10-14** — **Phase 6 built** (done-pending-owner-verification). The keystone is the
  **shared-format guard** (`src/components/editor/media/sharedFormat.guard.test.tsx`): a canonical
  fixture set that the desktop (real BlockNote editor + our schema) and phone (pure string helpers)
  must both serialize to the byte-identical `.md` and parse back to the identical ordered
  {ref, caption} — the regression guard against the two independent implementations drifting. The
  two **agreed on every fixture with zero code fixes**. The a11y/states code pass found the keyboard
  contract and `prefers-reduced-motion` already complete across all surfaces; the one real gap was
  `alt=""` on uncaptioned images (marks a content image decorative) → a `mediaAlt()` fallback
  ("Image", never a blob url) on all five image surfaces, desktop + phone, with tests. Docs:
  CLAUDE.md "TipTap"→BlockNote 0.55; ROADMAP `IMAGES` ticked; issues.txt MEDIA-IMAGES section (what
  shipped + the known deferrals); STRUCTURE.md media modules; wiki.md Phase-6 + a durable cross-phase
  lessons distillation. The consolidated **owner verification** checklist (desktop / gallery / phone /
  OneDrive, top-to-bottom) is at the end of this file. `tsc` + phone `tsc` clean; Vitest **689** green
  (677 + 12 new); `cargo check` clean. **Merge to main, `npm run tauri:build`, and the folder rename
  are the orchestrator's calls — NOT done here.** The owner walks the checklist on the native app +
  device + OneDrive before close-out.

## Decisions
- Inline gallery **block** (not a library). Backup **in scope**. Full **phone** UX now. (owner, 2026-10-14)
- **Binary over the Graph bridge = base64 both ways; the string path stays string.** The desktop
  native `http_request` is the only transport that bypasses CORS; it carries image bytes as a
  base64 request body / opt-in base64 response, while notes/.md/JSON/token calls keep the plain
  string body (unchanged). `graph.ts` flags `binaryBody`/`binaryResponse` localise this; tests
  mock the GraphClient so the real transport is owner-verified.
- **Media backup is content-addressed, not cTag-tracked.** A media ref's bytes are immutable (a new
  edit mints a new id), so there's no If-Match dance: a ref recorded `backedUp` is done, and a
  re-upload is an idempotent replace. Pull is driven by scanning a pulled note's markdown for refs
  (`extractMediaRefs`) rather than the /delta feed — simpler and exactly "rehydrate what the note needs".
- **The gold rune's store is module-level + connection-gated.** `backupStatus` is pub/sub callable
  from the engine (outside React) and read via `useMediaBackup` inside it, mirroring
  `lightboxController`. It only shows runes while OneDrive is connected, so a drive-less setup never
  wears permanent "not safe" dots; `absence = healthy` means a backed-up image renders no rune at all.
- **imageGroup stores its ordered images as a JSON-string prop** (`images`) — BlockNote
  propSchema values must be primitives, so an array of `{url,caption?,saving?}` can't be a
  prop directly. SAVE never hands the block to BlockNote's converter (encodeStructure maps
  it to the `pensieve:gallery` fence first), so the JSON stays an in-editor detail.
- **Collapse/promote is a block type-swap, degradation is automatic.** 2→1 remove →
  `updateBlock({type:"image"})` and the single-image block already serializes to plain
  `![]()` — no special fence→plain code. 1→2 (paste/drop/"+") → `updateBlock({type:
  "imageGroup"})` with the existing image first. Width is dropped on promote (galleries are
  count-driven, no per-tile width).
- **Adjacency-merge only at creation, never a silent reorg.** `planImageInsert` merges only
  when the anchor IS an image/group, or an image/group sits directly adjacent with nothing
  (or only a blank paragraph) between — a non-blank paragraph the user put between images
  blocks the merge.
- **Tiles reuse MediaBlock's CSS, not the component** (same pattern as ImageLightbox↔
  PreviewPortal) — object-fit:cover + count-driven sizing + no caption-below don't fit
  MediaBlock's single-image frame.
- The "+N more" cover opens the lightbox at the **covered image** (coverIndex 5, the 6th
  image, 1-based "index 6" in the spec), folding it + everything behind it into the count
  (Facebook/Photos convention) — the roadmap's loose "opens at 7" was reconciled to this.
- **Images own their markdown in `lib/md/image.ts`** (not BlockNote's built-in): the built-in
  serialises to a `<figure>` HTML blob and maps alt→`name` (asymmetric) — unusable. A custom
  block + our bridge gives plain `![]()` + full render control.
- **Width round-trip:** default (0.75) = plain `![caption](ref)` (native); any other snap =
  a `pensieve:image` fence carrying `ref\nwidth\ncaption`. Keeps the common case portable md.
- **Replace/Remove live on the image's own selected-state overlay**, not the GutterHandle —
  there is no existing block context menu to hang them off (GutterHandle is drag-only).
- Stable `mediaId` in the path + typed reference w/ unused `kind`/`timecode` = the future seam.
- Lightbox **reuses** `PreviewPortal`'s CSS but is its OWN component (`ImageLightbox` + a
  module-level `lightboxController`), not an extension of PreviewPortal — PreviewPortal renders
  note markdown, which an image lightbox must not carry. Opener is a module-level controller (not
  React context) so it's callable from a BlockNote block render / phone, outside the React tree.
  Gallery block coded as `ImageGroupBlock` (name clash avoidance).
- v1 lightbox: arrows/swipe/Home-End + "n/N" counter, **no filmstrip**; tile gutter `gap-1`.
- Media files are **never** auto-deleted on removal this update (version snapshots may reference them).
- **Phone stays decoupled from desktop `src/`.** The phone re-states the small, stable
  markdown format + a tiny IndexedDB store in `phone/src/lib/media/` rather than importing
  `src/lib/md`/`lib/media`/`store/idb.ts` — those drag the Tauri store/convertFileSrc chain,
  and the two apps deliberately share ONLY design tokens. A future shared `lib/` could unify.
- **Phone media rides in `Note.c` as markdown; the vault now persists to localStorage.** The
  phone prototype ran on in-memory seed (reset every reload) and serialized the body from
  `textContent`. To make a photo actually ROUND-TRIP a reload (owner check), the body now
  serializes media blocks to the shared markdown (`serializeNoteBody`) and the whole notes
  array persists to localStorage; bytes persist in IndexedDB keyed by ref. An absent/invalid
  store falls back to the seed. (This was a scoped addition — the prototype had no persistence.)
- **The note-conditional ring needed an opener.** `.note` (z140) covers the dock (z134), so
  the spell menu was previously un-summonable from an open memory. Added a quiet gold
  spell-opener in the note-top (fades with the top chrome while editing) so the "Picture"
  reach-point is actually reachable. Flagged for the owner — adjust if it reads as clutter.
- **Long-press reorder = drag within an edit mode.** Long-press a gallery → `.editing`
  (snap off, per-tile Remove, haptic); drag reorders via `elementFromPoint` crossings using
  the pure `reorderImages`. Device-verified (jsdom has no layout).

## Risks / watchlist
- Tauri asset-protocol scope must include the vault media dir or `convertFileSrc` URLs won't load (P0).
- BlockNote `uploadFile` is async; the mount-load `loading`-ref + `addToHistory=false` contract must
  not be tripped by async image insertion (P1).
- Phone contentEditable has no block model — the fenced-gallery renderer is a real cost (P4), not a detail.
- `extended.ts` fence-inside-fence limitation (issues.txt) if a gallery ever nests in a toggle — rare; watch.

## Phase 4 — owner device checklist (`npm run dev:phone`, open on the iPhone over LAN)
The feel + the OS sheet + touch gestures are NOT browser-verifiable (repo memory: automation
can't reach the dev server; jsdom has no layout). On the phone:
1. **Add from library** — open a memory, tap the photo key (left of the mic) → native sheet →
   Photo Library → pick one → it appears instantly inline; type below it.
2. **Take a photo** — same sheet → Take Photo → shows instantly after capture.
3. **Picture spell** — in a memory, tap the gold spell button in the top bar → the ring opens
   with **Picture** leading → cast it → same picker.
4. **Multi-select → carousel** — pick 2–3 at once → one gallery carousel; swipe left/right,
   watch the page dots; vertical swipe scrolls the note.
5. **Tap → lightbox** — tap a frame → full-screen; swipe between members; swipe-down or tap
   the backdrop to dismiss; pinch-zoom (OS) inside.
6. **Long-press → edit** — long-press a gallery → Remove (×) per tile + drag to reorder;
   remove down to 1 → collapses to a single image.
7. **Reload persists** — reload Safari → reopen the memory → the photo(s) are still there
   (bytes from IndexedDB, refs from the persisted note).
8. **Desktop-made gallery renders** — open the seeded **"Three frames from the coast"** memory
   → a `pensieve:gallery` fence shows as a carousel, not raw text.

## Phase 5 — owner native-app checklist (`npm run tauri dev` / the built `.app`)
A real OneDrive sync needs the owner's authenticated account + the native shell, so it can't be
exercised here (browser automation can't reach the dev server; no auth in jsdom). On the desktop app
with OneDrive connected (Pensieve summoned):
1. **Rune on a fresh image** — add an image to a note (paste / `/image` / drag). A small **gold dot**
   appears bottom-right of the frame ("held locally, not safe yet").
2. **Backs up → fades** — trigger a sync (it runs on connect; or hit Sync). The dot pulses while
   uploading, then **disappears** once backed up (absence = healthy). A quiet "Backing up N images…"
   line shows bottom-right while uploads are in flight.
3. **Binary in OneDrive** — in the OneDrive web UI, confirm the file under
   `Pensieve/media/<noteId>/<mediaId>.<ext>` (same path as the local vault), and that it opens as the
   real image.
4. **Reload holds** — restart the app; the backed-up images show **no rune** (state was persisted in
   `sync/state.json`).
5. **Second machine / restore** — on another machine (or after a destructive "restore from cloud"),
   the note pulls down AND its image rehydrates from OneDrive (the frame shows the photo, not the
   broken state).
6. **Failure is quiet** — (if you can force it, e.g. go offline mid-sync) a failed image turns the
   rune **warn-coloured** and you get **one** toast; it auto-retries on the next sync (never asks you
   to act).

## Owner verification (native app + device + OneDrive) — walk top to bottom
Nothing media-visual is verifiable in CI (browser automation can't reach the dev server; jsdom has
no layout; real OneDrive needs the authenticated account + native shell). This one ordered list
gathers every per-phase "needs owner run" item. Do the desktop block in `npm run tauri dev` (or the
built `.app`), the phone block on the iPhone via `npm run dev:phone`, the OneDrive block with the
drive connected. Check each in light AND dark where a look is involved.

### (a) Desktop — single image + lightbox (Phases 0–2)
1. **Asset-protocol load + reload** — paste / `/image` / drag an image into a note; it renders via
   its `convertFileSrc` asset URL. Reload the app → it still loads (not the broken state). This is
   the Phase-0 live check (asset scope + `protocol-asset` feature) that CI can't do.
2. **Paste a screenshot** — ⌘⇧4 to clipboard, ⌘V in a note → instant inline block, caret drops below.
3. **`/image` — URL then picker** — type `/image`, paste a URL + Enter embeds it; `/image` then Enter
   on the empty input opens the OS file picker.
4. **Drag-drop** — drag a file from Finder → one calm full-editor accent drop ring + insertion caret;
   it lands where the caret showed.
5. **Width snaps + caption** — select the image: ⌘] / ⌘[ step 25/50/75/100%; drag the handle snaps;
   Enter jumps into the caption, Esc leaves it. Caption reads back as the image's alt/label.
6. **Broken-file state** — remove the file on disk (or point at a missing ref) → the frame stays, with
   the glyph + "Image missing" + filename + Locate (never collapses).
7. **Lightbox** — Space / click expands; the thumbnail travels to centre over the blur+water backdrop;
   Esc / backdrop / close returns focus to the image. Confirm the travel feel + legibility in light
   AND dark. Toggle "reduce motion" in macOS → the travel becomes a cross-fade/cut.

### (b) Desktop — inline gallery (Phase 3)
8. **Each count layout** — drop 1, 2, 3, 4, then 5–8, then 9+ images (separately) → confirm 1 plain ·
   2 two-col · 3 three-col · 4 2×2 · 5–8 justified 3/row · 9+ capped at 6 tiles with a "+N more" cover.
9. **Drag-reorder** — drag a tile by its grip → a 2px accent insertion line shows; drop reorders, and
   the order persists through a reload (it's the line order in the `.md`).
10. **"+N more" → lightbox** — click the cover on a 9+ gallery → the lightbox opens at the covered
    image; ←/→, Home/End, the "n / N" counter all work; arrow past the 6-tile cap to the hidden ones.
11. **Drop-onto join** — drag a file ONTO an existing image/gallery → it merges into one gallery.
    (Known: the join reuses the ordinary insert caret — there's no distinct join rail yet; confirm the
    behaviour is right even though the visual isn't called out.)
12. **Remove → collapse** — × tiles down to 1 → the block collapses back to a single image (plain
    `![]()`); the removed file stays on disk; ⌘Z restores.

### (c) Phone — capture (Phase 4, `npm run dev:phone` on the iPhone over LAN)
13. **Add from library** — open a memory, tap the photo key (left of the mic) → native sheet → Photo
    Library → pick one → it appears instantly inline; type below it.
14. **Take a photo** — same sheet → Take Photo → shows instantly after capture.
15. **Picture spell** — tap the gold spell button in the note top bar → the ring opens with **Picture**
    leading → cast it → same picker. (Confirm the gold opener doesn't read as clutter — it's provisional.)
16. **Multi-select → carousel** — pick 2–3 at once → one gallery carousel; swipe left/right; the page
    dots track; a vertical swipe scrolls the note.
17. **Tap → lightbox** — tap a frame → full-screen; swipe between members; swipe-down or tap the
    backdrop to dismiss; pinch-zoom (OS) inside.
18. **Long-press → edit** — long-press a gallery → per-tile Remove (×) + drag to reorder; remove down
    to 1 → collapses to a single image.
19. **Reload persists** — reload Safari → reopen the memory → the photo(s) are still there (bytes from
    IndexedDB, refs from the persisted note).
20. **Desktop-made gallery renders** — open the seeded "Three frames from the coast" memory → the
    `pensieve:gallery` fence shows as a carousel, not raw text.

### (d) OneDrive — binary backup (Phase 5, desktop with the drive connected, Pensieve summoned)
21. **Rune on a fresh image** — add an image → a small gold dot appears bottom-right ("held locally").
22. **Backs up → fades** — sync runs (on connect, or hit Sync); the dot pulses while uploading then
    disappears once backed up (absence = healthy); a quiet "Backing up N images…" line shows while
    uploads are in flight.
23. **Binary in OneDrive** — in the OneDrive web UI, confirm the file at
    `Pensieve/media/<noteId>/<mediaId>.<ext>` opens as the real image.
24. **Reload holds** — restart the app → backed-up images show no rune (state persisted in
    `sync/state.json`).
25. **Second machine / restore** — on another machine (or after a destructive "restore from cloud")
    the note pulls down AND its image rehydrates from OneDrive (the photo shows, not the broken state).
26. **Failure is quiet** — force a failure (e.g. go offline mid-sync) → the rune turns warn-coloured
    and you get exactly one toast; it auto-retries next sync (never asks you to act).
