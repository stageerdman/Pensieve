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
