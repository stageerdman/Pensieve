# RAW-MEMORY-JOURNAL — wiki

## Why a new content type instead of just "another Memory kind"
A normal Memory is immediately real: titled, categorized, searchable the instant it's saved. A photographed journal page batch is deliberately NOT that yet — it's unreadable to search, has no title, and the owner explicitly wants to be able to throw it away cheaply (remove a page, remove the whole batch) before committing AI processing time to it. Modeling it as a Memory-in-a-weird-state would leak "raw" edge cases (empty transcript, no category) into every place Memory is rendered/searched. A distinct Raw Memory entity keeps that mess contained — one honest place for "batch waiting to be processed," matching the Modularity principle (CLAUDE.md).

## The future vision (not building yet)
Raw Memory should eventually be a general inbox: any mix of photos/audio/video/text dropped in together, plus a free-text instruction ("turn this into a trip summary," "just transcribe," "merge with my note about X"), and the desktop AI produces whatever final Memory shape the instruction implies. The journal-photo case is the first, simplest instance: implicit instruction = "transcribe these pages in order." Keep the data model (ordered list of heterogeneous media refs + optional instruction string + status) loose enough that audio/video slots in later without a schema rewrite — but do not build the general case now.

## Sync semantics decided so far
- Raw Memory is mutable (delete page / reorder / delete batch) on the phone right up until desktop processing starts.
- A phone-side delete must propagate through sync and remove the cloud copy — this is different from a normal Memory edit, which merges; a Raw Memory delete is a hard tombstone, not content to reconcile.
- Processing is desktop-only and destructive to the raw batch: success removes the raw batch everywhere and leaves exactly one final Memory in its place. No partial/hybrid state where both exist.

## Final Memory shape (target feel)
Photos first (looks like paging through the actual journal), transcript collapsed by default, one tap pops the transcript as an overlay on top of the photo (for copy, read, AI access) rather than pushing the photo out of view. Underneath, it's stored as normal markdown so search/AI treat it like any other Memory — the "raw photo look" is a presentation layer on ordinary content, not a special-cased note type at the data layer.

## Open questions to settle via Phase 1/2 prototypes
- Does the Raw Memory resting card in the feed look like a *stack* (implies "batch, pick it up") or a *single flagged card* (implies "one unit, don't worry about count")?
- How prominent should "not yet synced / not yet processed" status be — ambient (color/badge) or an explicit progress label?
- Reorder gesture on phone: drag-handle (established pattern — see [[phone-media-drag.md]], NEVER long-press on iOS) vs. a dedicated reorder mode.

## DECIDED (2026-11-09, after the first real-UI prototype review)

### Journal capture needs a genuinely NEW camera component — it cannot reuse Snap/Film's handoff
Snap and Film both work by firing a hidden `<input type=file accept=image/* capture=environment>` —
iOS's own camera app takes over, the owner shoots exactly ONE photo, and control returns to the page.
There is no live in-app viewfinder anywhere in this codebase today. The owner wants Journal to feel
different: tap once, land in the camera, shoot every page of the batch back-to-back without ever
leaving the viewfinder, and watch thumbnails pile up live underneath while staying in camera.
File-input capture structurally cannot do this (each activation is single-shot, by design, on iOS).
**Journal therefore needs a real custom live camera — `getUserMedia` + a canvas snapshot per shutter
tap — kept open across the whole batch.** This is new technical capability, not a reskin of an
existing spell. Phase 4 must build this camera engine before anything else in that phase; budget it
as its own sub-step, not a rounding error next to the review-grid UI.

### Desktop processing is 1 raw batch → N final Memories, split by date
The owner will sometimes photograph many pages spanning several different journal dates in one
capture session. Desktop AI processing must not assume 1 raw batch = 1 final Memory — it has to
read the handwritten/implied dates across the ordered pages, detect where one day's entry ends and
the next begins, and emit **one final Memory per detected date**, each carrying only its own photo
subset (in order) and the correct date metadata. A batch of 20 pages covering 6 days becomes 6
Memories, not 1 giant one or 20 tiny ones. This changes the data model (Phase 3) and the processing
step (Phase 5) — splitting logic is core scope for the journal case, not a deferred "generalization"
nice-to-have. Open question to confirm with the owner later: what happens to a page where the AI is
unsure of the boundary (merge into the prior day, or flag for a manual nudge)?

### Batch-level actions live in the Conditional spell menu, not flat buttons
Every other context in this app exposes its actions through the radial spell menu (a note's Delete,
a collection's Edit/Photo) — never a plain inline button bar. The Raw Memory detail screen must
follow the same pattern: opening it shows the real bottom Dock (Back + the gold spell-menu button);
tapping the gold button blooms a Conditional (accent-hue) ring with the batch's actions — at minimum
**Delete** (danger hue, opens the existing confirm sheet) — rather than a flat "Delete whole batch"
text button. The first real-UI prototype got this wrong (a flat button); corrected in the second
pass.

### Card glyph: NO flask at all, not a muted/empty one
First instinct (a desaturated, near-empty flask, "hasn't been brewed yet") was rejected on sight —
it still reads as a flask, so it reads as a normal, categorized Memory at a glance, which is exactly
the wrong signal. The decided direction, confirmed on the real-UI prototype: a **dashed empty-frame
placeholder** in the flask slot (same size/alignment as every other card — not the gutter-removed
variant, and not a muted flask).

## DECIDED (2026-11-09, desktop real-UI prototype — `raw-memory-desktop-real-ui.html`)

### Incoming batches live in the sync drawer's existing Process-queue shell
The desktop already has the right home for "things waiting to be processed": the sync drawer's
Process section (`ProcessQueue`/`ProcessRow`, today used for untranscribed audio — header with a
Run/pause control, one row per item, a %-complete line). A Journal batch is just another row kind
there (page-stack glyph instead of an order number, a page-count label, a peek button that unfolds a
thumbnail strip instead of audio preview) — not a new "inbox" surface. Keeps one place for "stuff
Pensieve hasn't gotten to yet," audio or photos.

### The date-split result needs its own legible list, with an explicit "unsure" state
A batch doesn't just silently become N memories — the owner needs to see the proposed split before
it's final: one row per detected day (thumbnail mosaic, date, page count), and a page the AI is NOT
confident about must show as its own flagged state with two one-tap resolutions ("merge into the
adjacent day" / "keep separate"), not a hidden best-guess. This answers the open question from the
first wiki entry: ambiguous boundaries are a quick owner decision, not an auto-merge.

### The final Memory's photos are the existing Gallery block — unchanged
No new "photo stack" component. A processed Raw Memory's pages become an ordinary Gallery block
(`.pensieve-gallery`), the exact one already used for any multi-image note. This is the whole point
of keeping Raw Memory's output a normal Memory at the data layer (see "Final Memory shape" above).

### DECIDED (2026-11-09, owner review of the desktop prototype)

**A — no separate "Journal batches" section.** Journal batches are rows in the SAME unified
"Process" list as audio, one list, one header, one Run/pause control — not a visually distinct
category. Corrected in the desktop prototype.

**B — the date-split is fully automatic; no review UI, ever.** The owner does not want to see a
split-confirmation screen in the product at all — AI decides and commits. The Round-1 "Scene B"
(a flagged/manual-resolve list) is removed from the prototype entirely, not just restyled. The real
algorithm, as specified by the owner — this is the Phase 5 processing spec, write it down precisely:
- Walk the ordered pages. A page normally carries ONE date header followed by its entry text.
- A date's entry runs across one or more pages until either the batch ends or a new date header
  appears.
- **A page can belong to the end of one date's Memory AND the start of the next** — when one page
  visually contains "...end of day N's text / DATE N+1 header / start of day N+1's text" on the same
  physical page. That page is not torn in half — it is referenced by BOTH final Memories as a shared
  source photo. **Resolved in Phase 3 (2026-11-09): the file is physically duplicated, once into
  each adjoining Memory's own media folder — not a cross-note reference.** Reason: media paths are
  `media/<noteId>/<mediaId>.<ext>` (see `lib/media/ref.ts`), and the Raw Memory's own folder is
  deleted once processing succeeds — a cross-note reference into whichever note "owns" the shared
  page would dangle the moment that note is later deleted. Duplication avoids coupling two otherwise
  independent Memories' lifetimes together.
- **First-page exception only:** if page 1 opens with some text BEFORE the first date header (e.g.
  a leftover line from whatever was on that page before the owner started this entry), ignore that
  leading text and start the first Memory at the first date header seen. This exception applies to
  page 1 of the whole batch only — every later page-spanning-two-dates case follows the normal
  shared-page rule above, not this ignore-leading-text rule.
- The AI should usually be able to tell the boundary from the handwriting/layout; when it genuinely
  can't, it still has to pick something — guess, don't block or surface a review screen.

**C — side-split pane confirmed as final**, and it needs two more things, both of which already
exist as real features elsewhere in the app, not new builds:
- Clicking a journal page must open the **real `ImageLightbox`** (`src/components/media/
  ImageLightbox.tsx`) — arrow-key prev/next between pages, wheel/trackpad zoom, drag-to-pan while
  zoomed, double-click to toggle zoom. This already exists for the Gallery block; Journal pages just
  need to call the same `lightbox.open({ items, index })`. No new zoom/swipe engine to build.
- The Memory stays a normal Memory — typed text blocks before/after/around the page block, same as
  any BlockNote document today. Already true structurally; nothing to build here either.
- The page block itself is **a new block type** ("Journal", working name) — shares the Gallery
  block's visual/DOM foundation (tile grid, lightbox hookup) but its own component/intent: default
  interaction is sequential swipe-through-like-a-real-journal rather than Gallery's general free-form
  photo grid. Not a prop flag on `<Gallery>` — a distinct block in Phase 4/5's editor work.

## BUILT (2026-11-10) — what's real, what's deliberately still open

Phases 3-5 are built and merged to `main` (full suite green, both apps build, native `.app`
reinstalled, phone PWA redeployed). Three things were deliberately NOT attempted this pass, each for
a specific reason rather than running out of time mid-task:

**OneDrive sync of the Raw Memory object kind was not wired.** Local capture → local storage →
local processing all work end to end (a Raw Memory can be created, filled, processed, and turned into
real Memories entirely on one device). What's missing is the cross-device half: pushing a Raw Memory
batch to OneDrive, pulling it down on desktop, and the phone-side delete-then-sync tombstone actually
reaching the cloud. The sync engine (`lib/sync/engine.ts`/`adapter.ts` + the Rust chunked-transfer
layer) is real, stateful, and touches the owner's live OneDrive account — getting a new object kind
wrong there risks corrupting sync state in a way that's hard to debug without the real account to
test against. Rather than wire something unverifiable and hope, this is named here as the next
focused piece of work, not silently skipped.

**The AI prompt's real-world accuracy is unverified.** `describe_journal_page` is proven to work as
a *mechanism* — verified live against the real `claude` CLI binary, including the non-obvious
`--add-dir` permission requirement and the `--bare`-breaks-OAuth-auth gotcha (both found by actually
running the command, not assumed). What's NOT verified: whether the prompt actually transcribes real
handwriting well, or correctly spots date headers on a real photographed page. There was nothing to
test it against — real journal photos only exist on the owner's phone. Expect the first real run to
need prompt tuning in `src/lib/raw/describePageTauri.ts`.

**The phone capture flow is unverified on a real device.** `getUserMedia` inside an installed iOS
PWA is a spot this project has been burned by before (see `audio-format-webkit.md`,
`voice-finalize-teardown-order.md` — WebKit's standalone-PWA media behavior has repeatedly differed
from what works in a normal browser tab). The camera engine is written for real correctness, but
jsdom has no camera hardware and no meaningful canvas pixel pipeline, so this is the one layer no
amount of unit testing substitutes for an actual phone. Try the Journal spell for real before relying
on it.

Also cut from this pass, smaller and lower-risk: drag-reorder in the phone capture/detail screens
(pages are removable, not yet reorderable), and phone-side rendering of a finished `pensieve:journal`
fence (it falls back to visible raw markdown text on phone rather than a rich page viewer — not a
crash, just not pretty yet, same category of gap as the historical "Phone markdown rendering gap").

## DECIDED (2026-11-10) — illegible words + date standardization

**Illegible words are guessed, not skipped** — wrapped in `{curly braces}` so the guess is visible
and distinguishable from confident text, rather than silently dropped or replaced with a placeholder
like `[illegible]`. Changed in the prompt (`describePageTauri.ts`) only; no transcript-storage change
needed — it's just text.

**Dates are standardized to `"<day> <full month name> <year>"`** (e.g. `"18 October 2024"`) regardless
of how the owner wrote it on the page, and the AI never guesses a year per page — it writes the
literal placeholder `"YYYY"` when a page shows none. A SEPARATE batch-level pass
(`resolveYearPlaceholders.ts`) resolves every `"YYYY"` afterward: if any page anywhere in the batch
shows a real year, that year applies to the whole batch (including pages earlier in the array than
the one that revealed it — the owner's exact point, the year isn't always on page 1). If no page
shows a year at all, `"YYYY"` becomes the real current year. This HAD to be a separate pass rather
than resolved per-page, because the per-page AI call has no visibility into any other page.

Fixing this also surfaced a real bug in the pre-existing `parseDetectedDate.ts`: its month-first
regex was unanchored and would swallow the first two digits of a 4-digit year as a fake "day" when
given day-first input (exactly the new standardized format) — e.g. `"3 November 2024"` parsed as
day=20 (from "20" of "2024"), losing both the real day and the year. Fixed with a digit-boundary
guard; regression-tested in `parseDetectedDate.test.ts`.
