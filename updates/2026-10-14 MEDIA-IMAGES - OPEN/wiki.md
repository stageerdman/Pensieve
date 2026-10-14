# MEDIA-IMAGES — wiki (durable decisions & lessons)

The first media modality: **images**. Inline in notes, stored locally with the original
kept, referenced in the `.md`, loaded fast, backed up to OneDrive, and capturable on both
desktop and phone. Audio/video/`@`-referencing/time-points are **future** — we only design
the seams for them here, we don't build them.

## Locked decisions (owner, 2026-10-14)
1. **Gallery = an inline block**, not a separate media library. Several images grouped into
   ONE block inside a note (grid/carousel, reorder, scroll, expand). One note = one story;
   the gallery is part of that story. Serializes into the note's `.md`.
2. **Backup is in scope for this update.** Images must reach OneDrive — no single-copy-on-disk
   media. Requires extending the sync adapter/engine for binaries (today it's `.md`-only).
3. **Full phone image UX ships now.** Phone gets the picker + both entry points (conditional
   spell menu + keyboard formatting bar) + inline display, producing the SAME markdown model
   as desktop. Real-vault sync rides along when PWA-CAPTURE lands.

## Technical ground truth (from code recon, 2026-10-14)

### Desktop editor = BlockNote 0.55 (NOT raw TipTap)
- `@blocknote/core|react|mantine` on ProseMirror/TipTap. CLAUDE.md says "TipTap"; the real
  substrate is BlockNote. (issues.txt already referenced BlockNote+Mantine.)
- BlockNote's **built-in `image` block is already in the schema** (`src/components/editor/editorSchema.ts`
  only overrides `inlineContentSpecs`; `blockSpecs` are left default) — just never surfaced
  in a menu or round-tripped deliberately yet.
- The **"/" slash menu is live out of the box**. The **"@" menu** (`Editor.tsx` ~196-214,
  `SuggestionMenuController` + `getItems`/`onItemClick` + `editor.insertInlineContent`) is the
  pattern to copy for a custom `/image` item.
- **No custom paste handling** exists. Add a ProseMirror `handlePaste` via the
  `_tiptapOptions.extensions` escape hatch (`Editor.tsx:100`), modelled on the existing raw
  plugin `src/components/editor/blockSelectionDecorations.ts`.
- **Custom node pattern:** `src/components/editor/noteLink.tsx` uses `createReactInlineContentSpec`.
  A block-level gallery uses `createReactBlockSpec` added to `blockSpecs` in `editorSchema.ts`.
- **Markdown bridge:** `src/lib/md/extended.ts`. BlockNote's own `blocksToMarkdownLossy` /
  `tryParseMarkdownToBlocks` do the base conversion; this file wraps them. A plain image
  round-trips for free as `![alt](url)`. Anything standard markdown can't carry (gallery group,
  width, captions, stable media id) must ride the **block-level `pensieve:*` fenced-code bridge**
  (`encodeStructure`/`reconstructStructure`, ~171/198) — mirror that pattern; do NOT touch
  BlockNote internals. `src/lib/text.ts` (48, 80) already strips `![](...)` for previews/word-count.
- **Auto-save gotcha (respect it):** mount-time content loads MUST go through
  `loadBlocksWithoutHistory` (`Editor.tsx:69-75`, `addToHistory=false`) or one ⌘Z reverts the
  load → blank → autosave wipes the `.md`. Regression test: `src/components/editor/undoLoad.test.tsx`.

### Storage / filesystem
- Vault = `<appData>/vault/` (`src-tauri/src/lib.rs:41-52`). `resolve(app, rel)` is the single
  path-traversal guard (rejects `..` / leading `/`) and already permits subfolders.
- On-disk: `notes/<id>.md` (source of truth) + `notes/<id>.meta.json` sidecar + `timelines/<id>.json`
  + `sync/state.json`. `secrets.json` sits next to the vault (0600).
- **Only a TEXT write command exists** (`write_text`, `lib.rs:64-71`). There is **no binary write
  path**. → add e.g. `write_bytes(rel, Vec<u8>)` (model on `write_text`, reuse `resolve`, register
  in the `invoke_handler!` at `lib.rs:222-234`). `remove_path` deletes files only, not dirs.
- **Media path convention (NEW, define here):** `vault/media/<noteId>/<mediaId>.<ext>`. Original
  kept as-is. Markdown stores the vault-relative ref (`media/<noteId>/<mediaId>.<ext>`); rewritten
  to a fast local asset URL at load (Tauri `convertFileSrc` asset protocol), rewritten back on save.
- **"SQLite index" is aspirational** — today it's an in-memory inverted index
  (`src/lib/search/indexer.ts`). No SQLite in the tree. Don't assume a DB.
- Store layer: `src/lib/store/{index,tauri,browser}.ts` behind a `Store` interface
  (`src/lib/types.ts`). `isTauri()` picks Tauri vs Browser (localStorage) adapter. Add media
  methods to the interface + both adapters.

### OneDrive backup = `.md`-only today
- `src/lib/sync/adapter.ts`: one flat remote folder `Pensieve`, one `<noteId>.md` per note.
  Both the local walk (`vault.ts listNotes` = `notes/*.md`) and the remote `/delta` filter to
  names ending `.md` (`noteIdFromName`, adapter.ts ~36/83). `uploadNote` sends a JS string body
  (`text/markdown`). Sidecars are NOT synced.
- To back up media: add a remote path scheme for binaries, a binary upload/download (not a
  string body), enumerate media alongside notes in `engine.ts` (~175-224), and loosen the
  `.md`-only filters. This is the backup phase of the update.

### Phone PWA = separate app, separate editor
- Lives in `phone/`, own Vite app (`npm run dev:phone`, port 5174, LAN host). Shares ONLY design
  tokens with desktop — no shared editor/components.
- **Phone editor is an uncontrolled `contentEditable` div** (`phone/src/components/note/NoteBody.tsx`),
  formatting via `document.execCommand`. NOT BlockNote. Images are inserted into the DOM here, not
  via a BlockNote node — so the phone needs its own image/gallery rendering that serializes to the
  SAME markdown model.
- **Spell Menu** (`phone/src/lib/spells/{types,registry}.ts`, rendered by
  `spellmenu/SpellRing.tsx`, icons in `SpellGlyph.tsx`): spells are DATA; behaviour dispatched in
  `PhoneApp.tsx` `castSpellAction` (~450). `conditionalSpells("note")` is the note-open roster
  (Label/Mark/Link/Pin/Export) — where an "image" spell goes. NOTE: `PhoneApp.tsx:160` hardcodes
  `useSpellMenu("home")`, so the note-conditional ring isn't wired to open from an open note yet.
- **Keyboard formatting bar** = `phone/src/components/note/NoteToolbar.tsx` (`FmtKey` =
  title|body|bold|list, + mic + Done). Add an `"image"` member + button; branch in `applyFmt`
  (`PhoneApp.tsx:321`). This is the "when typing" entry point.
- No file/camera input exists anywhere on phone — net-new. iOS: `<input type=file accept="image/*">`
  yields the OS Photo Library / Take Photo / Choose File sheet.
- Phone `Note` type (`phone/src/types.ts`) has no media field — extend it, plus `seed.ts` and
  `useAutosave.ts`.

## Open seams for the future (shape now, build later)
- Every media gets a **stable id** (the `<mediaId>` in the path) so `@`-referencing a photo and
  (for video/audio) time-point references can attach to it without a rewrite.
- The markdown representation should carry that id, not just a filename, so references survive
  rename/move.

## Synthesized UX model (from the 4-agent Steve-Jobs UX team, 2026-10-14)

### One base component: `MediaBlock` (design.md names it)
Single image = one MediaBlock. Gallery = MediaBlocks sharing one frame. Phone image = same
MediaBlock, narrower column. Shared tokens (identical across all three — the sameness IS the
family): frame `rounded-lg`; resting `border` hairline, no shadow; placeholder fill
`surface-raised`; caption `text-muted text-xs` BELOW the frame (never overlaid); selected
`ring-2 ring-accent ring-offset-2`; keyboard-focus adds the `accent-glow` halo (the only glow
a MediaBlock gets); gallery gap `gap-2`; image `overflow-hidden` so photo corners match.
**No one adds a second radius, a shadow, a gradient scrim, or a second ring colour.**

### The reference model (the data seam — build this shape now)
- Every media gets a **stable `mediaId`** minted at insert (opaque, e.g. ULID-ish). File lives at
  `vault/media/<noteId>/<mediaId>.<ext>`; original kept untouched. The id is embedded in the path,
  so it survives in plain markdown.
- In-memory reference = a small typed object: **`{ mediaId, kind:'image', caption?, width?, timecode? }`**.
  `kind` and `timecode` are unused-but-present so video/audio and time-point `@`-refs slot in later
  with **no schema migration**. A gallery = an ordered list of these; a single image = a block with one.
- **Markdown serialization:**
  - Single image → standard `![caption](media/<noteId>/<mediaId>.<ext>)` (round-trips via BlockNote's
    image block for free; caption doubles as alt). A non-default `width` rides the extended-md
    `pensieve:*` bridge since plain `![]()` can't carry it.
  - Gallery → a `pensieve:gallery` fenced block (extended.ts bridge) carrying the ordered refs.
- **Load** rewrites `media/...` refs → a fast local asset URL (Tauri `convertFileSrc` on desktop;
  blob/object URL from IndexedDB on phone/browser). **Save** rewrites back to the vault-relative ref.

### Desktop single image
Paste (Cmd+V) = instant inline block at cursor, cursor drops to a new para below. `/image` (`/img`,
`/photo`) inserts an empty block with ONE inline input: paste a URL + Enter embeds; Enter on empty
opens the OS file picker — **no tabbed Upload|Embed|Search panel, the web-search tab is deleted.**
Drag-drop = one calm full-editor `accent-glow` drop ring + a thin insertion caret. All three funnel
through BlockNote's `uploadFile`. Behaviors KEPT: width-only resize (snaps 25/50/75/100%, `Cmd+[`/`Cmd+]`),
caption=alt (one field; `Enter` edits, ghost only when selected), Replace/Remove in the gutter menu,
`Space`=expand. Default size **75% of text column, left-aligned**; tall images max-height ~60vh;
images are always **block-level** (no inline/floating). CUT: alignment/float, crop/rotate/filters,
per-image borders/shadows, image-as-link, web image search.

### The lightbox — the ONE magical moment (shared, all surfaces)
`z-30` (design.md "preview/overlay" — deliberately below `z-50` toasts so a StatusWhisper still
surfaces over it; NOT `z-40` modal). Thumbnail **travels** (FLIP/shared-element) from its on-page
rect to centre, 180–220ms ease-out; backdrop = `surface` ~85% + subtle blur (reads as the Basin
closing in dark). Collapse reverses. `prefers-reduced-motion` → cross-fade. In a gallery, left/right
arrows (`←`/`→`, swipe on phone) step siblings inside the same expanded view. Dismiss: Esc / backdrop /
close IconButton / (phone) swipe-down. No zoom UI (OS pinch only), no rotate, no download, no filmstrip.

### States matrix — **absence = healthy** (every state quiet, non-blocking)
Loading = `surface-raised` fill + slow opacity shimmer (no spinner). Saving = image shows instantly
from blob/object-URL + a faint `accent` progress hairline bottom edge. Success = bare frame, no
checkmark. Broken/missing = keep the rect, `surface-raised` fill, muted glyph + "Image missing" +
filename + (desktop) Locate/Reveal — **never collapse to nothing (loses the ref)**; one toast on load.
Oversized = never block; downscaled display asset, original untouched. **Backup:** a small `gold`
sync rune bottom-right = "held locally, not safe yet"; pulses/fills while backing up; **fades to
nothing once backed up** (backed-up is the restful default); turns `warn` + one toast on failure
(auto-retries, never asks the user). StatusWhisper aggregates ("Backing up 3 images…").

### Phone (matches Spell Menu + NoteToolbar language)
ONE action, two reach-points, same glyph (new `image` IconName, accent hue): (A) a **"Picture"**
spell leading `conditionalSpells("note")` — keyboard-down path, needs the hardcoded
`useSpellMenu("home")` at `PhoneApp.tsx:160` made note-aware; (B) an **image button in NoteToolbar**
left of the mic — keyboard-up path, inserts at the live caret; it's an **insert, not a format**
(new `onInsertImage`, don't extend `FmtKey`), fired on `onPointerDown`+`preventDefault` to preserve
the caret. Both click a hidden `<input type=file accept="image/*" multiple>` → the native iOS sheet
(Photo Library · Take Photo · Choose File). **No `capture` attr** (would force camera-only). **No
custom sheet, no paste-URL on phone, no in-app camera, no captions/alt prompt, no editing.** Image
shows instantly from an object-URL, saves in the background. Multi-select or adjacency-merge →
auto-gallery (swipe carousel + page dots). Collapse to single when a gallery drops to one.

### Cross-cutting cautions
- **Do NOT garbage-collect media files on block removal this update** — timeline/version snapshots
  (note-versioning, already shipped) may still reference a removed image. Safe GC is a later concern.
- Phone persistence: phone has no real vault yet, so phone media **bytes go in IndexedDB** (not
  base64 in localStorage) keyed by the ref path, resolved to blob URLs at load; they reach OneDrive/
  the vault when PWA-CAPTURE/sync lands.
- Tauri: the vault media dir must be in the **asset-protocol scope** (`tauri.conf.json`) for
  `convertFileSrc` URLs to load — a real config step, verify it.

## Lessons (fill as we build)

### Phase 0 — storage plumbing (2026-10-14)
- **Binary IPC = base64 strings, not `Vec<u8>` params.** `write_bytes(rel, data: String)` /
  `read_bytes(rel) -> Option<String>` take/return base64; the JS side encodes
  (`src/lib/media/base64.ts`, chunked `btoa` to survive `fromCharCode`'s arg limit on big images),
  Rust decodes with the `base64` crate (`STANDARD` engine, added `base64 = "0.22"`). A JS number
  array over the invoke bridge is slow for image-sized payloads — this is the deliberate reason.
- **Asset protocol needs BOTH a Cargo feature AND config** — this is the gotcha:
  - `src-tauri/Cargo.toml`: `tauri = { … features = ["protocol-asset"] }`. Without it the build
    fails at the build-script with *"dependency features … does not match the allowlist … add the
    `protocol-asset` feature."* (config-only is not enough.)
  - `src-tauri/tauri.conf.json` → `app.security.assetProtocol`:
    ```json
    "assetProtocol": { "enable": true, "scope": ["$APPDATA/vault/media/**"] }
    ```
    `$APPDATA` is the Tauri v2 scope variable that maps to `app_data_dir()` — the exact dir
    `vault_root()` builds from — so it resolves to `~/Library/Application Support/xyz.erdman.pensieve`
    on macOS, matching the vault. `/**` is a recursive glob covering `media/<noteId>/<file>`. Scoped
    to `media/` only (not the whole vault) so notes/sidecars/secrets are never asset-reachable.
  - **CSP:** `app.security.csp` is `null` today, so Tauri injects no CSP and asset URLs load freely —
    nothing to add this phase. **When a CSP is introduced later**, it MUST allow the asset origin in
    `img-src` (`asset:` + on macOS `asset://localhost`, on Windows `http://asset.localhost`) or vault
    images silently fail to load.
  - **Not verifiable here:** the live asset-load check (does a saved PNG render via its
    `convertFileSrc` URL?) is the owner's native-app run — browser automation can't reach the dev
    server (repo memory), and a full `tauri build` is too slow for this phase.
- **`convertFileSrc` wants an absolute path.** The Tauri adapter caches `appDataDir()` once per run
  and builds `<appData>/vault/<ref>`; it does NOT probe the file first (a second IPC round-trip per
  image) — a missing file surfaces as a broken image, handled by the UI later.
- **Ref↔URL inverse is a registry, not string surgery.** A blob URL is opaque and an asset URL encodes
  an absolute path, so neither reverses cleanly to the vault-relative ref. `src/lib/media/url.ts`
  keeps a bidirectional `ref↔url` map: `resolveMediaUrl` records the pairing, `refForUrl`/`urlForRef`
  look it up — lossless by construction, backend-agnostic. (Markdown save-time rewrite in Phase 1
  will use `refForUrl`.)
- **Browser/phone media = IndexedDB, injectable.** `src/lib/store/idb.ts` is a tiny
  `MediaBlobStore {put,get,delete}` (keyed by ref, opened lazily so constructing it never touches
  IndexedDB — jsdom has none). `BrowserStore` takes it via constructor with an IndexedDB default, so
  tests inject an in-memory `Map` fake — **no `fake-indexeddb` dependency added.** jsdom's `Blob` has
  no `arrayBuffer()`, so the round-trip test asserts `blob.size`; `URL.createObjectURL` is stubbed.
- **Traversal guard extracted to a pure `is_safe_rel(rel)`** so it's unit-testable without an
  `AppHandle`; `resolve()` calls it. Rust `#[test]`s cover the guard + base64 round-trip
  (`cargo test` 2/2).
- **Media files are never auto-GC'd on removal** (`removeMedia` doc-comment in `types.ts`): version/
  timeline snapshots may still reference a removed image. Removal is for explicit cases only.

### Phase 1 — desktop single image (2026-10-14)
- **BlockNote's built-in `image` block is unusable for our `.md`** (verified by spike):
  `blocksToMarkdownLossy` on an image block emits a `<figure><img><figcaption>` HTML blob,
  NOT `![]()`; and `tryParseMarkdownToBlocks` maps the alt text into `props.name`, leaving
  `props.caption` empty (asymmetric). So we **replace** it with our own `createReactBlockSpec`
  `image` block and own the markdown in `lib/md/image.ts`.
- **`createReactBlockSpec(config, impl)` returns a CREATOR**, not a spec — register it as
  `image: ImageBlock()` (called). `createReactInlineContentSpec` (noteLink) returns the spec
  directly (uncalled) — the two custom-spec factories differ, which is a trap. Mis-registering
  throws `Cannot read properties of undefined (reading 'node')` at schema build.
- **A custom image block round-trips plainly:** give the impl `parse: (el)=> el.tagName==="IMG"
  ? {url: src, caption: alt} : undefined` and `toExternalHTML: ({block})=> <img src alt>`. Then
  `tryParseMarkdownToBlocks("![cap](ref)")` → our block with `caption` set, and
  `blocksToMarkdownLossy(ourBlock)` → `![cap](ref)` (no figure). Verified incl. a caption with
  markdown-special chars (`a *starry* night`) — remark escapes/unescapes alt symmetrically, so
  it's idempotent. `parse`/`toExternalHTML` are part of `CustomBlockImplementation` and allowed
  on the React impl (the type Omits only `render`/`toExternalHTML` to re-add React FC forms).
- **A text node containing `![...](...)` also serialises verbatim** (no escaping) — handy, but
  we don't rely on it; the native toExternalHTML path is cleaner.
- **Width round-trip:** plain `![]()` can't carry width, so only the **default (0.75)** rides
  native markdown; any other snap (0.25/0.5/1) is bridged to a `pensieve:image` fence
  (`ref\nwidth\ncaption`) in `encodeStructure`/`reconstructStructure`, mirroring the toggle
  bridge. `langOf`/`fence()` helpers reused.
- **Load-time url resolution lives inside `extendedMdToBlocks`** (a final awaited
  `resolveImageUrls` pass), so blocks arrive display-ready BEFORE `loadBlocksWithoutHistory`
  mounts them — no post-mount mutation, no false dirty, no undo step to wipe. The undoLoad
  regression stays green. If the store can't resolve a ref (missing file / no IndexedDB in
  jsdom), the **ref is kept** as the url — the block still round-trips on save and the UI shows
  the broken state; `resolveMediaUrl` swallows the error and returns null.
- **Save-time rewrite is `refForUrl(url) ?? url`** — a registered loadable url → its ref; an
  external pasted `https://…` url (or an unresolved ref) is kept as-is (external image, not
  saved). Because load registered every media url, the lookup is lossless.
- **Slash menu:** add `/image` by giving a `SuggestionMenuController triggerCharacter="/"` whose
  `getItems` is `filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), imageItem], q)`
  — providing a `/` controller replaces the default menu, so you must re-add the defaults.
  `insertOrUpdateBlockForSlashMenu(editor, block)` (from `@blocknote/core`) inserts/replaces the
  current block; the suggestion plugin clears the typed `/query` itself.
- **jsdom test harness gotcha:** mounting a real BlockNote editor and awaiting a `done`-promise
  INSIDE `act()` **deadlocks** — React won't flush the mount effect while `act` blocks on a bare
  promise that only the effect can resolve. Fix: render, then **poll** `for(…) await act(()=>
  new Promise(r=>setTimeout(r,10)))` until a `finished` flag flips. (A one-shot `setTimeout`
  tick isn't reliable; the poll is.)
- **Replace/Remove** have no existing block menu to live in (GutterHandle is drag-only), so they
  render as a small overlay control row on the selected/focused image. **Removal does NOT delete
  the file** (version/timeline snapshots may reference it) — it just swaps the block to an empty
  paragraph.
- **Not verifiable here:** the live asset-load render (does a saved PNG show via its
  `convertFileSrc` url in the WKWebView?), real OS paste/drag/file-picker, and the drop ring +
  caret visuals — all need the owner's native-app run (browser automation can't reach the dev
  server; `tauri build` is out of scope for the phase).

### Phase 2 — the lightbox (2026-10-14)
- **Reused PreviewPortal's CSS, did NOT extend the component.** PreviewPortal renders note
  markdown (`<NotePreview>`) and is inherently note-specific — wrong base for an image viewer.
  The magic CSS, though, is NOT note-specific: `focus-backdrop`/`focus-backdrop-fx` (blur+darken
  backdrop), `portal-halo` (outer breathing glow), `portal-water` (drifting caustic light) and
  `portal-enter` (scale-in) all key off `border-radius: inherit` + absolute positioning and work
  on ANY positioned parent. So `ImageLightbox` **reuses them verbatim** — no edits to those
  classes, hence **no way to regress PreviewPortal's home-preview** (zero generalisation needed).
  New CSS is namespaced `.lightbox-*` (layout/framing/chrome only). The one shared *value*
  borrowed (not a class) is PreviewPortal's pane shadow `0 40px 120px -24px rgba(0,0,0,0.55)` on
  the image, keeping the magical shadow language consistent.
- **The opener is a module-level pub/sub controller, not React context** (`lightboxController.ts`:
  `open`/`close`/`subscribe`). It MUST be callable from a BlockNote custom-block render and the
  paste/drop ProseMirror plugin — both live outside the React tree, where a context hook is
  unreachable. One `<ImageLightbox/>` mounted at the app root subscribes and renders. This is the
  same "inject through a module seam" pattern as `mediaContext`/`noteLink`. **The Phase 3/4 API:**
  `lightbox.open({ items:{url,caption?}[], index, originRect?, originElement? })` — one-OR-many
  from day one; `many = items.length > 1` gates the arrows/Home-End/counter, so a gallery needs
  no change here. The lightbox DISPLAYS urls only — it never resolves refs (Phase 0 did that).
- **z-30, portalled to `document.body`.** z-30 is design.md "preview/overlay" — deliberately below
  z-40 modal and z-50 toast, so a StatusWhisper surfaces over an open lightbox (confirmed: z-index
  wins over DOM order, so even though the body-portal is appended after `#root`, the z-50 toast
  still paints on top). Portalling to body escapes the editor's `overflow-y-auto` clip.
- **FLIP travel = inline transform on the frame, cleared over a transition.** Capture the centred
  frame's rect, compute `translate+scale` (top-left origin) to the origin thumb rect, apply it
  instantly (transition:none + reflow), then clear transform under a 200ms ease-out → it travels
  from thumb to centre. Collapse reverses (transition TO the origin transform, unmount on
  `transitionend` with a `setTimeout` safety net so it never hangs). `prefers-reduced-motion` OR a
  missing `originRect` → skip FLIP, use the `portal-enter` cross-fade (which reduced-motion itself
  stills to an instant cut via the existing media query). Collapse only reverse-travels when still
  on the origin index; a navigated-away item cuts (can't cleanly scale a different aspect to the
  origin thumb).
- **Two different origin elements.** Focus-restore needs the *focusable* host (the `tabIndex` div);
  the travel rect needs the *picture frame* (`.pensieve-media-frame`, the actual image box, not the
  full-width host). `expandImage(url, alt, focusEl, rectEl)` passes them separately →
  `originElement` (focus) and `originRect` (travel) on the controller.
- **jsdom caveats the tests rely on:** jsdom has no `matchMedia` (so `prefersReducedMotion()` guards
  `typeof matchMedia === "function"`) and `getBoundingClientRect` returns all-zeros (so the FLIP
  bails on a zero-size frame) — meaning the travel never fires in tests and doesn't interfere.
  The reduced-motion test stubs `matchMedia`; the single-image close path has no `originRect` so it
  cuts via `queueMicrotask` (awaited by `waitFor`). `afterEach` must `cleanup()` BEFORE
  `lightbox.close()` (unmount unsubscribes first) or the stray close logs an act() warning.
- **`IconButton` gained `forwardRef` + an AA `focus-visible:ring-2 ring-accent` ring** (needed to
  move focus to the close button and for keyboard operability) — a safe, backward-compatible change
  to the shared component; all existing callers pass children/onClick/label/title/active only.
- **Not verifiable here (owner's native run):** the travel animation *feel* (timing/easing),
  backdrop blur + water-light legibility in light vs dark, and Space-to-expand from a real
  WKWebView-rendered image — browser automation can't reach the dev server; `tauri build` is out
  of scope for the phase.

### Phase 3 — desktop inline gallery (2026-10-14)
- **The `pensieve:gallery` fence (lib/md/gallery.ts).** One `ref | caption` line per image,
  caption optional/trimmed, **display order = line order** — so a drag-reorder in the editor
  is literally a line reorder in the `.md`. Separator is ` | ` (split on the first occurrence;
  media refs never contain it). Mirrors `pensieve:image` exactly: SAVE rewrites each url→ref
  (`refForUrl`, external urls kept verbatim), LOAD resolves each ref→url (`resolveMediaUrl`,
  registering the pair). Encode is wired into `encodeStructure` and reconstruct into
  `reconstructStructure` in extended.ts (before the image-fence branch); gallery ref
  resolution is folded into image.ts's `resolveImageUrls` tree-walk so the undoLoad contract
  (blocks arrive display-ready, no post-mount mutation) still holds.
- **BlockNote props must be primitives → the image list is a JSON-string prop.** `imageGroup`
  has a single `images: {default:"[]"}` prop holding `JSON.stringify([{url,caption?,saving?}])`.
  An array-of-objects prop is NOT allowed by propSchema. `parseGalleryImages`/`stringifyGalleryImages`
  are the (defensive, never-throwing) bridge; the block never reaches BlockNote's own Markdown
  converter because encodeStructure maps it to the fence first (same as the image block).
- **Collapse/promote is a block TYPE-SWAP, and markdown degradation is then automatic.**
  Removing a tile down to 1 → `editor.updateBlock(id, {type:"image", props:{url,caption,width}})`;
  the single-image block already serialises to plain `![]()` — there is NO fence→plain special
  case to write. Promote (1→2 via paste/drop/"+") → `updateBlock(id, {type:"imageGroup"})` with
  the existing image placed first. `updateBlock` changing a block's `type` works cleanly (same
  mechanism ImageBlock's Remove uses to swap to a paragraph) and is ⌘Z-undoable. **Width is
  dropped on promote** — galleries are count-driven, no per-tile width.
- **Emergent creation planned as a pure function** (`planImageInsert` in galleryModel.ts), so
  the merge/group/single decision is unit-tested without an editor. Rules: anchor IS an
  image/group → merge (drop-onto); else the block right after the anchor is an image/group →
  merge (adjacency, new image lands directly before it); else a blank paragraph anchor with an
  image/group right before → merge; else 2+ files → group, 1 → single. **Only blank/nothing
  counts as "adjacent"** — a non-blank paragraph the user typed between two images blocks the
  merge (never silently reorganise a deliberate separation). The orchestration (`insertGroup.ts`)
  sits ABOVE insertImage's `saveImageFile` funnel — every byte still saves the same way; the
  Editor's paste/drop handler just routes through `insertImagesSmart` now (imagePasteDrop.ts is
  untouched, as the plan required).
- **Per-tile partial-upload state via a transient `saving` flag in the JSON.** A new group/merge
  inserts tiles with `{url: <local object url>, saving:true}` instantly, then each file's
  background `saveImageFile` swaps that index's url and clears `saving` (writes serialize because
  all completions mutate one shared closure array before re-stringifying — no lost updates under
  parallel saves). `saving` is never serialised (encode ignores it).
- **Tiles reuse MediaBlock's CSS language, NOT the component** — the same call the lightbox made
  with PreviewPortal. A grid tile is `object-fit:cover`, square (`aspect-ratio:1`), count-sized,
  with no per-tile width and a lazy hover caption — none of which fit MediaBlock's single-image
  frame (contain + max-h 60vh + width-% + caption-below). So tiles are their own small markup
  sharing the `--radius`/`--border`/`--accent` tokens and the `.pensieve-media-progress` saving
  hairline. The count cap (≤6 tiles) is what keeps a gallery ≤2 rows; overflow spills to the
  lightbox (no in-block scroll/carousel on desktop).
- **The "+N more" cover opens the lightbox at the COVERED image.** 6 tiles max; the 6th
  (coverIndex 5) dims image #6 and shows `+N` where N folds image #6 + everything behind it
  (count − 5, the Facebook/Photos convention) and clicking opens the lightbox at index 5. This
  reconciles the plan's two phrasings ("index 6" detailed vs "opens at 7" roadmap) to one
  consistent behaviour. **Caveat:** images beyond the 6th have no in-block ×/caption controls
  (you reach them via the lightbox, which is view-only) — acceptable for v1, flagged here.
- **Drag-reorder is pointer-based (HTML5 drag can't drop in the WKWebView shell** — same reason
  GutterHandle is pointer-driven). The reorder math (`reorderImages`, `insertionIndexAt`) is
  pure/tested; the pointer wiring + the 2px accent insertion line are **owner-native-run
  verification** (DOM drag isn't unit-testable, per the plan).
- **Drop-onto-join reuses the existing drop caret, no dedicated join-rail.** The plan asked for
  a distinct "2px accent drop-rail with accent-glow on the target edge" when dropping ONTO an
  image/gallery. imagePasteDrop was left untouched (the plan also said "extend, don't fork" it),
  so its existing accent caret (`.pensieve-media-caret`, a 3px accent line with an accent halo at
  the hovered block edge) + the full-editor `accent-glow` ring already mark the drop target; the
  JOIN behaviour is correct (planImageInsert merges), but there is no visual that distinguishes a
  join from an insert yet. **Deliberate minor deviation** — noted for a possible polish pass
  (Phase 6) if the owner wants the join visually called out.
- **Not verifiable here (owner's native run):** every count's layout, the drag-reorder feel +
  insertion line, the "+N more"→lightbox jump, and the drop-onto-join drop target — all need the
  real WKWebView; browser automation can't reach the dev server and `tauri build` is out of scope
  for the phase.

### Phase 4 — phone image capture (2026-10-14)
- **Phone persistence reality (the recon conclusion):** the phone had **no persistence** —
  `dataRef = createSeed()` is an in-memory copy reset every reload, and the body was serialized
  from each contentEditable child's `textContent` joined by `\n`. That model **cannot carry an
  image** (a non-editable media element has no meaningful textContent → it would be silently
  dropped on save). So two things changed: body serialization now walks blocks and emits the
  shared markdown for media (`serializeNoteBody`), and the vault now **persists to localStorage**
  (notes array) with **bytes in IndexedDB** keyed by ref — the only way a photo ROUND-TRIPS a
  reload (the owner's check). An absent/invalid store falls back to the seed.
- **Cross-app imports were rejected — phone stays decoupled.** `phone/` is its own Vite app
  (`root: phone/`, tsconfig `include:["src"]` = phone/src) that shares ONLY `src/styles/tokens.css`
  (via a CSS `@import`). The desktop `lib/md/{gallery,image}.ts` + `lib/media/url.ts` drag the
  Tauri store / `convertFileSrc` chain; `store/idb.ts` is dependency-free but lives under the
  desktop tree. Rather than import across the boundary (coupling + pulling native deps into the
  phone bundle), the small **stable format** (`pensieve:gallery`, ` | `, `![](ref)`, line order)
  and a tiny IndexedDB store are **re-stated** in `phone/src/lib/media/` with a comment pointing
  at the desktop source of truth. A future shared `lib/` boundary could unify them.
- **Media = non-editable DOM blocks, mutated imperatively (NoteBody's hard constraint).** The
  phone editor is an uncontrolled contentEditable React never re-renders. Media blocks are plain
  `contentEditable=false` elements built in `components/note/mediaDom.ts`, carrying their payload
  in a **`data-media` JSON attribute** (the serialization source of truth); the visual DOM
  (img/carousel/dots) is DERIVED and rebuilt on any mutation, which then calls `ctx.onChange()`
  → autosave. The `MediaCtx` lives on a stable ref object (DOM blocks capture it once) whose
  `.onChange` is refreshed each render so it always calls the latest autosave.
- **Type-guard trap:** a `node is HTMLElement` predicate used in a `!isMediaEl(x)` position
  narrows the operand to `never` (TS removes HTMLElement in the false branch), breaking every
  later `.textContent`/`.after`. Fix: `isMediaEl` returns a **plain boolean**, not a predicate.
- **The note-conditional ring had no opener.** `.note` (z140) sits above the dock (z134), so the
  spell menu — only openable from the dock — was un-summonable from inside a memory (the wiki's
  known gap). Making `useSpellMenu` note-aware is necessary but not sufficient; added a quiet
  gold spell-opener to the **note-top** (fades with the top chrome on `.editing-note`). It opens
  the ring in Conditional form (Picture leading) because `menu = useSpellMenu(noteMounted ?
  "note" : "home")` and `openMenu()` re-derives from the live context.
- **Insert = one hidden `<input type=file accept=image/* multiple>` with NO `capture` attr** (a
  `capture` attr would force camera-only; its absence gives the full iOS sheet: Photo Library /
  Take Photo / Choose File). Both reach-points `.click()` it. `onPickFiles` mints a ref per file
  (`mintMediaRef` → `media/<noteId>/<id>.<ext>`), `registerLocalMedia` (object-URL instant +
  background IndexedDB write), then `insertImages` decides single vs gallery and merges into an
  adjacent media block (emergent gallery), 2→1 collapses back to a single image.
- **Lightbox + carousel are CSS scroll-snap** (left/right = native snap; dots update on scroll),
  **not** a reimport of the desktop `ImageLightbox` (it's desktop-CSS-bound). The phone lightbox
  is its own React component + a module-level `lightboxController` (pub/sub) the imperative media
  blocks call from outside React — same seam as the desktop. Swipe-DOWN to dismiss is a pointer
  drag that only engages when the gesture is decided-vertical (horizontal is left to snap).
- **Desktop-made galleries render for free:** `parseNoteContent` is the same fence/image grammar,
  so a `pensieve:gallery` authored on desktop becomes a carousel on load. Seeded as a demo note
  with offline **SVG data-URI** refs (resolve as direct urls, no byte store) — a real `media/…`
  ref would show the broken state until PWA-CAPTURE/sync brings the bytes across.
- **Forward-compatible vs awaiting PWA-CAPTURE:** the `.md` the phone produces is byte-identical
  to the desktop model (same refs, same fences), so when PWA-CAPTURE / real sync lands these notes
  + the IndexedDB bytes flow into the vault/OneDrive with no rewrite. NOT built here: the real
  vault write, OneDrive sync, in-app camera, captions/alt prompt, paste-URL on phone.
- **Not verifiable here (owner device run):** the native OS photo sheet, the carousel/lightbox
  swipe + pinch feel, long-press drag-reorder, and real reload persistence — all need the iPhone
  via `npm run dev:phone` (browser automation can't reach the dev server; jsdom has no layout).
  The pure bridge (parse/serialize/collapse/reorder) + the DOM render↔serialize + insert
  single/gallery/merge are unit-tested (16 new tests).

### Phase 5 — OneDrive binary backup (2026-10-14)
- **`http_request` was string-only, both ways — that was the real blocker.** `HttpReq.body` was an
  `Option<String>` sent via `send_string`; the response came back via `resp.into_string()`. Neither
  can carry arbitrary image bytes. Fix: add `body_base64: Option<String>` (decoded to bytes, sent via
  `ureq`'s `send_bytes`) and a `response_base64: bool` flag (response read via `into_reader()` →
  `read_to_end` → base64). **`serde(rename_all = "camelCase")` on both structs is the trick that keeps
  the string path byte-identical** — `method`/`url`/`headers`/`body` are single words so they're
  unchanged, and the new multi-word fields map to the JS `bodyBase64`/`responseBase64`. A pure
  `request_body(body, body_base64)` helper encodes the precedence (base64 > string > none) and is the
  one `#[test]` (the HTTP itself needs the network/owner run). Model it on Phase 0's `write_bytes`
  (same `base64` crate, `STANDARD` engine).
- **The TS binary seam is two flags on `GraphFetchOptions`, not a new client.** `binaryBody` base64's
  a `Uint8Array`/`ArrayBuffer` body across the native bridge; `binaryResponse` decodes the base64
  response into a bytes-backed `Response` (so `.arrayBuffer()` works). The upload PUT returns small
  JSON — left as the normal string path; only the download GET sets `binaryResponse`. The browser/test
  path handles bytes natively, so the flags are no-ops there and tests just mock the GraphClient.
  TS 5.7 narrows typed arrays to `Uint8Array<ArrayBufferLike>` which doesn't satisfy the DOM `BodyInit`
  generic — one `as unknown as BodyInit` cast at each byte-body site (adapter PUT, Response ctor).
- **Remote scheme mirrors local exactly: `<root>/media/<noteId>/<mediaId>.<ext>`.** Graph path
  addressing (`/me/drive/root:/Pensieve/media/<noteId>/<file>:/content`) auto-creates the intermediate
  folders on the content PUT — no separate mkdir. Content-type is mapped by extension
  (octet-stream fallback).
- **The `.md`-only filters did NOT need loosening to AVOID media — they already skip it safely.** A
  media file (`<id>.png`) fails `noteIdFromName` (not `.md`) → `id=null` → skipped, and the `media/`
  folder is a folder item → skipped. So media is never *misread* as a note. What was needed was the
  positive direction: `mediaRefFromItem(item)` recognises a media binary from its `parentReference.path`
  + name (used for classification/tests). Pull, though, is driven by **scanning a pulled note's
  markdown** (`extractMediaRefs`, a regex for `media/<noteId>/<id>.<ext>` validated by `parseMediaPath`,
  catching both `![](…)` and `pensieve:gallery` fence lines) — simpler than a /delta media walk and
  exactly "fetch what the note references".
- **Media backup is content-addressed, so there's no cTag.** The bytes are immutable (an edit mints a
  new id), so a ref recorded `backedUp` in `SyncState.media` is done and a re-upload is an idempotent
  replace. Push enumerates `vault.listMedia()` (two-level walk: `media/` → `<noteId>` dirs → files) and
  uploads anything not yet backed up. **Failures are recorded (`failedAt`) + surfaced via the rune and
  retried next sync, never thrown** — one flaky image must not abort the note sync.
- **`SyncState.media` is optional for back-compat.** Pre-media `state.json` files have no `media` key;
  the engine inits it to `{}`. `EMPTY_SYNC_STATE` gained `media: {}` but `readState` still returns the
  parsed file as-is (no injection), so the existing "parses a valid stored state" test (no media key)
  stays green.
- **The rune store is module-level pub/sub, connection-gated, `absence = healthy`.**
  `src/lib/media/backupStatus.ts` — `setMediaBackupState(ref,state)` from the engine (outside React),
  read via `useMediaBackup(ref)` (`useSyncExternalStore`) inside it, same seam as `lightboxController`.
  `getMediaBackupState` defaults an unknown ref to `"local"` and a null/external ref to `"backed-up"`
  (= no rune). A cached `summary` object keeps `useSyncExternalStore`'s getSnapshot stable (React errors
  on a fresh object each call). `setMediaBackupEnabled` gates every rune on the OneDrive connection
  (flipped by `useSync` on connect/disconnect/mount), so a drive-less setup shows no dots. `useSync`
  seeds the store from `SyncState.media` on mount so runes are right before any manual sync.
- **MediaBlock got a `backup?` prop; gallery tiles need a child component for the hook.** The single
  image passes `useMediaBackup(refForUrl(url))` into MediaBlock (which renders `<MediaRune/>` bottom-
  right, or nothing when backed up). Gallery tiles can't call the hook inside the `.map` (rules of
  hooks), so a tiny `<TileRune url=…/>` child calls it per tile. One `MediaBackupWhisper` (beside
  StatusWhisper, a little higher to avoid overlap) is the single aggregate: "Backing up N images…" +
  exactly one toast when the failure count grows.
- **Not verifiable here (owner native run):** a real OneDrive round-trip (needs the authenticated
  account + native shell), the rune fade feel, and the second-machine/restore rehydration against live
  Graph. Everything is unit-tested against a mocked Graph/HTTP (24 new tests); the owner checklist in
  `update v1.md` covers the live path. Phone media backup is intentionally NOT built here (deferred to
  PWA-CAPTURE) — the phone already produces byte-identical `.md`, so it rides this engine unchanged
  when real phone sync lands.
