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

### Phase 3 — Desktop inline gallery (`ImageGroupBlock`)  ⏳
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

### Phase 4 — Phone image capture  ⏳
- Make the spell context note-aware (replace hardcoded `useSpellMenu("home")` at `PhoneApp.tsx:160`).
- `image` IconName + glyph; **"Picture"** spell leading `conditionalSpells("note")` + dispatch.
- NoteToolbar image button left of the mic + `onInsertImage` (pointerdown+preventDefault; NOT a `FmtKey`).
- Hidden `<input type=file accept="image/*" multiple>` (no `capture` attr) → native iOS sheet.
- Imperative insert of non-editable image/group blocks into the contentEditable; **minimal fenced-block
  renderer** so desktop-made galleries don't show as raw text. Object-URL instant + background IndexedDB save.
- Swipe carousel + page dots for groups; tap → lightbox (OS pinch); long-press reorder/remove; collapse-to-single.
- Extend phone `Note` type + `seed.ts` + `useAutosave.ts` for media; serialize to the SAME markdown model.
- **Verify:** `npm run dev:phone` on the owner's iPhone — add from library, take a photo, multi-select → carousel, reopen.

### Phase 5 — OneDrive binary backup  ⏳
- Adapter: media remote path scheme + binary upload/download (not a string body); loosen the `.md`-only
  filters; keyed on `mediaId`. Engine enumerates media alongside notes (`engine.ts` push/pull loops).
- `gold` sync-rune states on `MediaBlock`: held-local → backing-up (pulse) → backed-up (fades) →
  failed (`warn` + one toast, auto-retry). StatusWhisper aggregates.
- Tests: media enumerated + PUT; delta pulls media; restore on a second vault rehydrates images.
- **Verify:** native app — add an image, watch it back up (rune fades), confirm the binary in OneDrive.

### Phase 6 — Polish, docs, close-out  ⏳
- Full states-matrix + a11y pass (focus rings, keyboard contract, alt=caption, reduced-motion, both themes).
- **Do NOT add media garbage-collection** (timeline/version snapshots may reference removed images) —
  note it as a deliberate deferral.
- Docs: tick ROADMAP `IMAGES`; update `issues.txt`; fix CLAUDE.md "TipTap"→BlockNote reality; add the
  media module(s) to `STRUCTURE.md`. Record lessons in `wiki.md`.
- Merge to `main` + `npm run tauri:build` so the owner can test the native app (per standing rule).
  Rename folder `- OPEN` → `- CLOSED`; prune the branch.

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

## Decisions
- Inline gallery **block** (not a library). Backup **in scope**. Full **phone** UX now. (owner, 2026-10-14)
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

## Risks / watchlist
- Tauri asset-protocol scope must include the vault media dir or `convertFileSrc` URLs won't load (P0).
- BlockNote `uploadFile` is async; the mount-load `loading`-ref + `addToHistory=false` contract must
  not be tripped by async image insertion (P1).
- Phone contentEditable has no block model — the fenced-gallery renderer is a real cost (P4), not a detail.
- `extended.ts` fence-inside-fence limitation (issues.txt) if a gallery ever nests in a toggle — rare; watch.
