# RAW-MEMORY-JOURNAL

## Goal
Let the owner photograph pages of a real physical journal on the phone, batch-upload them, and have the desktop AI turn the photo batch into a searchable final Memory (photos-on-top + transcript underneath). This is the first concrete instance of a new content type — **Raw Memory** — a holding pen for "needs processing before it's a real memory" material. The architecture should generalize later to other raw inputs (audio+video+text bundles with a free-form AI instruction), but this update only builds the journal-photo case.

## Core concept: Raw Memory vs Memory
- **Memory** (existing): a note — typed/voice/image/video — immediately real, titled, categorized, searchable.
- **Raw Memory** (new): an *unprocessed batch* — right now, ordered journal-page photos. Not searchable, not categorized, visually distinct/"inert" in the feed. Can be opened to view/reorder/delete pages, or delete the whole batch, on the phone, **before and after sync, as long as it hasn't been processed by desktop AI yet**. Deleting it on phone + syncing removes it from the cloud too.
- Once desktop AI processes a Raw Memory, the raw batch is consumed and replaced by a **final Memory**: journal photos on top (source, swipeable/stacked), transcript collapsed underneath with a toggle to pop it over the photo (for copy/search/AI-readability). Looks like markdown underneath; looks like the journal on top.

## Phased roadmap

### Phase 1 — Phone UX prototyping — DONE, owner-approved (2026-11-09)
Round 1 (5 generic fake-phone-bezel prototypes) was dropped entirely — wrong fidelity. Round 2
(`raw-memory-real-ui.html`) rebuilt as one page linking the actual phone stylesheets and reusing the
actual component markup. Round 2 feedback landed three corrections (continuous live camera instead
of per-shot native handoff; batch actions via the Conditional spell ring instead of a flat button;
no flask at all instead of a muted one) plus a drag-reorder bug (the horizontal camera strip was
showing the vertical masonry's top/bottom drop-bar and always inserting "before" regardless of
drag direction — fixed: orientation-aware before/after hit-test + a left/right bar for the strip).
**Owner-approved phone direction:** continuous camera session, Conditional-ring batch actions, and
the **dashed-placeholder** no-flask variant (empty frame where the flask would be, same size/
alignment as a normal card — not the flush/gutter-removed variant).
**Status: DONE.**

### Phase 2 — Desktop UX prototyping — DONE, owner-approved (2026-11-09)
`raw-memory-desktop-real-ui.html` built against the real desktop code (compiled the app's own
Tailwind output + linked the real `blocknote-skin.css`/`audio.css`/`index.css`, not a redraw). Round 1
feedback landed three corrections, now in v2 of the file and logged in `wiki.md`: (A) Journal batches
are rows in the SAME unified Process list as audio — one header, one Run/pause, no separate section.
(B) The date-split review screen is removed entirely, not just restyled — it's fully automatic, no
UI ever; the owner's exact splitting algorithm (a page can be the end of one day AND the start of
the next; a leading-text exception for page 1 only) is written down in `wiki.md` as the Phase 5
spec instead. (C) The overlay-on-photo alternative is dropped — the side-split transcript pane is
final — and clicking a journal page opens the real `ImageLightbox` (arrow-key nav, wheel zoom,
drag-to-pan, double-click zoom — already built, just wired up) via a new "Journal" block type that
shares Gallery's tile/lightbox foundation but isn't literally `<Gallery>`. A typed line above the
page block now makes "still a normal Memory" concrete in the prototype, not just asserted.
**Status: DONE.**

### Phase 3 — Data model & sync semantics — SPEC WRITTEN (2026-11-09), not yet built
Grounded in the real conventions already in the codebase (`lib/media/ref.ts`'s `media/<id>/<mediaId>.
<ext>` path, `lib/md/gallery.ts`'s `pensieve:gallery` fence + sidecar-transcript pattern from
VideoBlock/AudioBlock) rather than inventing a parallel format.

**Raw Memory entity.** Its own vault record, NOT a Memory-in-a-weird-state (see `wiki.md`) and NOT
indexed into search at all (excluded at the SQLite-index layer, not filtered in UI). Frontmatter:
`id`, `status: capturing | queued | synced | processing | done`, `createdAt`, and an ordered `pages`
list of refs using the SAME `media/<rawId>/<mediaId>.<ext>` path convention a normal note's media
uses (`rawId` fills the slot `mintMediaRef`/`mediaRef()` calls `noteId`) — so the existing
`extractMediaRefs`/sync-pull machinery needs zero changes to find and move the files.

**Sync.** Travels through the existing OneDrive-backed engine (reuses the above path convention),
tagged as a distinct sync object kind so the pull side never indexes it as a Memory. Phone-side
delete + sync = a hard tombstone (removes the cloud copy), not a merge — per the existing decision
below.

**1 raw batch → N final Memories, each a completely ordinary note.** Processing (Phase 5's job, but
the shape has to exist here first) creates, per detected date group:
- a new note (its own fresh `noteId`/media folder) with an empty/typed body the owner can still edit,
- one new **`journal` block** (see below) whose page refs point at files COPIED into that note's own
  `media/<newNoteId>/` folder — not left pointing into the raw batch's folder, because that folder is
  deleted once processing succeeds. **A page shared between two dates (see the splitting algorithm in
  `wiki.md`) is therefore physically duplicated — once into each adjoining Memory's own folder** —
  not a cross-note reference. (This was logged as an open question in the first wiki pass; resolved
  now that the "raw folder gets deleted after processing" constraint makes a cross-note reference
  fragile — it would dangle the moment the other note is deleted.)
- a transcript sidecar per page, using the EXACT mechanism `VideoBlock`/`AudioBlock` already use
  (`getStore().loadTranscript(ref)` keyed by that page's own new media ref) — no new transcript
  storage format.
- a frontmatter date field set to the detected date, for sorting/display.

Only after all N final Memories are written does the Raw Memory get deleted (local + cloud
tombstone) — write-finals-then-delete-raw, so a crash mid-process leaves (at worst) a redundant raw
batch sitting next to already-created finals, never silent data loss.

**New `journal` block (BlockNote).** A distinct block type, not a prop flag on the existing
`imageGroup`/Gallery block — per the owner's "like gallery but a different intent." Markdown fence
mirrors `pensieve:gallery` exactly for round-trip consistency: `pensieve:journal`, one
`media/<noteId>/<mediaId>.<ext>` ref per line, display order = line order. Default click behavior
opens the real `ImageLightbox` straight into sequential page-by-page viewing (not Gallery's
general free-form grid-first feel).
**Status: DONE** — `RawMemory` type + `Store.{list,load,save,remove}RawMemory` (tauri.ts +
browser.ts), `splitByDate`/`sharesBoundary` (fully unit-tested, owner's exact rule), `journal`
block (`lib/md/journal.ts` + `JournalBlock.tsx`/`Journal.tsx`, wired into `extended.ts`/
`editorSchema.ts`/`resolveImageUrls`). The one open item from this phase — shared-boundary
duplication vs. cross-note reference — is resolved (duplicate; see wiki.md) and implemented in
Phase 5's `processRawBatch.ts`.

### Phase 4 — Phone implementation — DONE (2026-11-10), on-device verification still owed
Built: the Journal spell (book glyph, `registry.ts`/`SpellGlyph.tsx`); `JournalCamera` — a real
`getUserMedia` session that stays open across the whole batch (`lib/media/journalCamera.ts`,
tapping the shutter never reopens anything, unlike Snap/Film's native handoff); `rawMemoryStore.ts`
(Raw Memory's own localStorage list + page bytes reusing the existing `mediaStore.ts` IndexedDB
unchanged); `JournalCaptureScreen`/`JournalDetailScreen`; a new `"raw-detail"` Conditional-ring
context (`registry.ts`) so Delete/Add-pages are ring spells, not flat buttons, matching every other
context; the dashed-placeholder Raw Memory card on Home. **Scope cut, disclosed:** pages are
removable but not drag-reorderable in either screen this pass — the prototype's pointer-drag
physics weren't ported. **Not verified on a real device** — `getUserMedia` in an installed iOS PWA
has known rough edges elsewhere in this project's history (see `audio-format-webkit.md` and related
memory notes); the owner should specifically exercise the Journal spell and report back.

### Phase 5 — Desktop implementation — DONE (2026-11-10), AI-accuracy unverified
Built: `describe_journal_page` (`src-tauri/src/ai_vision.rs`) — shells out to the logged-in `claude`
CLI, verified LIVE against the real binary (not guessed): headless `-p` sandboxes file reads by
default (confirmed by a real failing + passing probe), so the command grants `--add-dir` for just
the page's folder; `--bare` is deliberately NOT used because it forces API-key auth, breaking "use
the logged-in account" (CLAUDE.md) — also confirmed live. `processRawBatch.ts` orchestrates
describe → split → N new Memories (each with its own `journal` block, pages duplicated into its own
media folder, per-page transcript sidecars, `createdAt` set from the detected date via
`parseDetectedDate.ts`). Wired into the real Process queue (`ProcessItem` is now a discriminated
union; one unified list, one Run button, per wiki.md "A"). The journal transcript split pane
(`JournalTranscriptSplit.tsx`) reuses the real `.pensieve-transcript-split` shell with a page
scrubber instead of audio controls. **What's real vs. unverified:** the plumbing (parsing, grouping,
file duplication, note assembly) is unit-tested with mocked AI responses and passes end to end; the
PROMPT's actual transcription/date-detection accuracy against real handwritten pages has not been
validated — there are no real journal photos to test against. Try it on a real batch and expect to
tune the prompt in `describePageTauri.ts`.

### Phase 6 — Generalization note (no build)
Record in wiki.md how Raw Memory should generalize to mixed-media batches (audio+video+text+photos) with a free-text AI instruction at the end, producing whatever final Memory shape the instruction asks for. This phase is documentation only — do not build it now.
**Status: not started** (by design — explicitly out of scope for this update).

### Phase 7 — Test, build, ship — PARTIALLY DONE
Done: full vitest suite (1103 tests, 0 failures), `tsc --noEmit` clean on both apps, `npm run build`
+ `npm run build:phone` clean, `npm run tauri:build` (native `.app` reinstalled to `/Applications`,
timestamp-verified), `npm run deploy:phone` (live at pensieve-phone.pages.dev), merged to `main` and
pushed. **Not done, and deliberately not attempted — see wiki.md's final entry:** real OneDrive sync
of the new Raw Memory object kind. On-device confirmation of the phone capture flow is the owner's
to do next.

## Decisions log
See `wiki.md`.
