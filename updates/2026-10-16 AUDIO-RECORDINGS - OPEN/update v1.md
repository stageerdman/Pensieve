# AUDIO-RECORDINGS — update v1

## Goal
Make **audio** a first-class media type in Pensieve, **desktop first**. Audio is media:
it can sit inline in a note and inside a gallery. The core artifact is an **audio player
bar** (play · waveform/volume viz · scrub · time · ⋯ menu [download / create transcript] ·
transcript icon). A **transcript** is a sidecar tied to the *audio reference* (NOT part of
the `.md`); when present it opens as a desktop **Split View** — editor left, transcript
right, player docked on top (Spotify-like), with the spoken word **highlighted word-by-word
as the audio plays**. Transcript text becomes searchable in **Accio**.

**Transcription itself is out of scope here** (comes right after) — but we design and build
the full seam for it: the sidecar schema, loading, rendering, sync, and search. This update
is **UX-led**: the hard part is the design. We produce judgeable `.html` prototypes first,
the owner picks, then we build.

## ▶ RESUME HERE (for the next session / new AI) — updated 2026-10-17 (SAVE BEFORE RESTART)
**Branch:** `update/audio-recordings` — ALL work pushed to origin, tree CLEAN. HEAD = `d564100`.
Branched off `main`, **not yet merged**. **Design LOCKED** (⚑ block atop `prototypes/design-spec.md`).
**816→842 tests pass · `tsc` clean · web build OK. Native `tauri:build` NOT run yet (P7).**

### ░ ONE THING TO TEST FIRST ON BOOT — the open bug (drag mp3 → gallery)
`npm run dev` → open DevTools **Console**, filter `media:` → create/open a gallery (`/gallery`,
add an image via **+**), then **drag an mp3 from Finder onto the gallery**. Report what logs:
- want: `media:gallery.dropListeners.attached {root:"ProseMirror"}` (wired), then on drop
  `media:gallery.nativeDrop {accepted:1}` + a dashed ring appears → **then it works**.
- if the drop logs `media:drop.received` / `media:insertSmart` instead → it landed OUTSIDE the
  gallery (editor-wide handler) — widen the hit-test.
- if **NOTHING** logs on drag → the editor-root capture listener still isn't catching it.
The latest fix (`d564100`) attaches dragover/drop to the gallery's `.ProseMirror` root in the
CAPTURE phase (ancestor of where BlockNote listens) + hit-tests the cursor against the gallery.
**This is UNVERIFIED by the owner** — it's the thing to confirm first. See "OPEN BUG" below for
everything tried.

### What WORKS (owner-confirmed, browser dev):
- `/audio` → **Record** (live recorder: Stop/pause/elapsed/waveform) → Saving → playable bar.
  Also `/audio` → *choose a file*. (Native mic needs the macOS entitlement — verify in P7.)
- Transcript: **⋯ → Create transcript** (DEV-seeds the bundled real call) → transcript icon accent
  → **Split to Transcript** (resizable pane, word-sync, click-to-seek) / **Dropdown Transcript**
  (inline, selectable/copyable). Test mp3: `prototypes/assets/audio.mp3`; search `problém`/`partnerku`.
- **Accio transcript-hit jump-lines**: search a spoken word → timecoded jumps under the result card
  → click opens the note + transcript split seeked there.
- **Audio in a gallery**: add via the gallery **+ / "Add media"** button (works) OR ⋯ on the card →
  Create transcript. Round-trips via the `audio:` sigil in the `pensieve:gallery` fence.
- Voice-memo notes have **no title** anywhere (not "Untitled").
- Dragging an audio bar/card body no longer duplicates it (only the 6-dots gutter handle moves it).

### ⚠ OPEN BUG — dragging an mp3 ONTO a gallery (the ONLY thing not working)
**Symptom:** dragging an mp3 from Finder onto a gallery gives NO "drop here" affordance (only
BlockNote's between-row positions), and historically NO `media:` log fired during the drag.
Uploading the SAME mp3 via the + button works and persists. Images drag in fine.
**Proven NOT the cause:** markdown serialization — a real-editor round-trip test
(`galleryRoundTrip.test`) confirms an audio gallery entry (`audio:` sigil + `kind`) round-trips.
Both save paths register the url↔ref pairing, so persistence is sound once a tile is added.
**Root cause (from a fresh-eyes investigation):** BlockNote/ProseMirror handle (and can swallow)
file drags at the **editor root** before the event reaches our gallery node, AND our schema had
replaced BlockNote's default audio block (no `fileBlockAccept`) so an un-caught mp3 fell to
BlockNote's generic **`file` block** (the "stuck under the gallery, moves with it" artifact).
**What we tried (in order), and why each failed:**
1. Gallery React `onDrop` (image-only) + route audio via the editor-wide PM plugin — FAILED: the
   PM plugin's `hasFiles` gate never passes for audio in the shell (no `drop.received` ever logged).
2. NATIVE listeners on the gallery ELEMENT (bubble, then capture) — FAILED: too deep; BlockNote
   swallows at the editor root above us, so the element listeners never fire.
3. Removed BlockNote's default `file`/`video` block specs (`editorSchema.ts`) — GOOD + kept: now an
   un-caught media drop inserts NOTHING instead of a stray `file` block. (Didn't make the drop work.)
4. DOCUMENT-level capture listeners — plausibly correct but tipped `App.test` over its 4s editor-
   mount timeout under full-suite load. Replaced by #5.
5. **CURRENT (`d564100`):** listeners on the gallery's `.ProseMirror` root, CAPTURE phase (ancestor
   of view.dom → runs before BlockNote), hit-testing `elementFromPoint ∈ gallery`. Test-safe (842
   pass 3×). **UNVERIFIED by owner — test it first (above).**
**Current assumption / if #5 fails:** the `.ProseMirror` capture listener should beat BlockNote;
if the owner still sees NO `media:gallery.*` log on drag, the next hypotheses are (a) the drag's
`dataTransfer` has no `Files` type during dragover in the shell so our `dragHasFiles`/preventDefault
never runs (→ inspect `dataTransfer.types` live), or (b) `elementFromPoint` returns a BlockNote
drop-cursor overlay instead of the gallery (→ hit-test by rect instead of elementFromPoint). A
reliable fallback UX if drag stays unwinnable: drag an mp3 → a STANDALONE audio block (already wired
for open-space single-audio), then merge into the gallery; the + button already covers adding audio.

### CLEANUP owed once the drag bug is closed:
Demote/remove the diagnostic logs added for this hunt: `media:drop.received`, `media:insertSmart`,
`media:group.persist.start/ok`, `media:gallery.encode.audio`, `media:gallery.reconstruct.audio`,
`media:gallery.nativeDrop`, `media:gallery.dropListeners.attached` (keep as `debug` or delete).

### Gallery is now DECOMPOSED (owner asked "a file per element"), under `src/components/editor/media/gallery/`:
`Gallery.tsx` (orchestrator) → `GalleryRow.tsx` → `GalleryTile.tsx` → `GalleryImageElement.tsx` /
`GalleryAudioElement.tsx` (leaves); `useGalleryDrop.ts` (the drop hook — where the bug fix lives).
`ImageGroupBlock.tsx` is now a thin block-spec shell mounting `<Gallery>`.

### NEXT after the drag bug:
**P6.5** (lower priority) home/flask duration chip + transcript-fills-flask (prototype `06-home-flask`).
Then **P7:** `npm run build` → **`npm run tauri:build`** → device-verify (incl. native mic
entitlement) → merge `update/audio-recordings` → `main` → rename folder `- OPEN`→`- CLOSED`. Replace
the DEV transcript seed (`_sampleDominik.dev.json`, `createTranscript` in AudioBlock +
gallery/GalleryAudioElement) with the real whisper engine when it lands.

--- (historical "how to test" + P5.2 detail below) ---

**P5 CONFIRMED by owner (2026-10-17).** After P5.1, a **P5.2 bugfix series** (owner testing the
dropdown reader + multi-select) landed and is confirmed working:
- P5.2  — kill the full-row node-selection blue for audio; scrub no longer hijacked by a marquee
  passing over the bar; controller keyed by **block id** (not url) so duplicated blocks have
  independent playheads.
- P5.2b–d — dropdown transcript is a **read-only editable island** (`contentEditable` + input
  blocked): restores char-level select + ⌘C, no node-drag/duplicate (native mousedown stopper;
  dragstart cancelled). Root cause: PM forces every `content:"none"` atom nodeview
  `contentEditable=false` → region was unselectable.
- P5.2c — `selectBlockRange` (new, tested): marquee now selects a run of audio blocks for
  deletion (BlockNote's setSelection throws on void endpoints → raw PM TextSelection fallback).
- P5.2e — marquee suppresses text-selection from the first instant of a blank-space press
  (`pensieve-marquee-press`) so it no longer smears a selection before engaging.
**816 tests pass · tsc clean · web build OK.** **NOW BUILDING P6.**

**DEV PLACEHOLDER to delete when the whisper engine lands:** "Create transcript" seeds
`src/lib/transcripts/_sampleDominik.dev.json` (the real call, matches the test mp3; wrong for any
other audio). Replace the `createTranscript` seed in `AudioBlock.tsx` with the real engine call
(same `Transcript` schema) and delete the sample json.

**Key files:** engine `src/lib/audio/{time,peaks,controller}.ts`; player `src/components/audio/
{AudioBar,Waveform,TranscriptView,TranscriptSplit,transcriptController,icons}.tsx` + `audio.css`;
block `src/components/editor/media/{AudioBlock,insertAudio}.tsx`; md `src/lib/md/audio.ts`
(wired in `extended.ts` + `image.ts` resolve pass); transcripts `src/lib/transcripts/*`;
store methods in `src/lib/store/{tauri,browser}.ts`; schema `editorSchema.ts`; slash `Editor.tsx`.
**Known minor:** split pane stays attached to one note across note-switches (tidy later).

## What already exists (grounded — see wiki.md for cites)
- **Editor blocks** are custom BlockNote specs (`createReactBlockSpec(...)()`) registered in
  `src/components/editor/editorSchema.ts`; media round-trips to `.md` via our own fences
  (`pensieve:image`, `pensieve:gallery`) in `src/lib/md/`. Audio = the same pattern
  (`pensieve:audio`). Slash menu already **filters out** BlockNote's default "audio" item
  (`Editor.tsx` `MEDIA_KEYS`) — we add our own.
- **Media ref seam is pre-built for audio**: `MediaRef` (`src/lib/media/ref.ts`) already has
  `kind` (today only `"image"`) and `timecode` reserved "so audio/video slot in with no
  schema migration." Byte storage (`saveMedia`/`loadMediaUrl`), the Tauri asset protocol
  (scope `$APPDATA/vault/media/**`), and sync (`extractMediaRefs`) are all ext-generic —
  an `.mp3` needs **no store/Rust change**.
- **Search has no SQLite** (contrary to older docs) — it's an in-memory inverted index fed by
  one chokepoint, `Store.bodies()`. Fold transcript text in there → searchable, zero changes
  to the query/index/UI layers.
- **Sidecar precedent** exists (`<id>.meta.json`): system data that never touches the `.md`.
- **Overlay seam** exists: `lightboxController.ts` is a module-level pub/sub that lets a
  BlockNote block (outside React) command a root-mounted portal open — the model for opening
  the transcript Split View from an inline bar.

## What is net-new (the risk)
1. **Resizable Split View.** The shell (`App.tsx:291` body flex-row) today holds only the
   editor + a fixed `w-72` dock (Timeline/Details, mutually exclusive). A ~50/50 resizable
   editor-left / transcript-right pane does not exist and must be built.
2. **Audio inside the gallery.** Desktop gallery is a **justified image strip keyed on
   aspect-ratio tiles** — an audio bar is not an aspect tile. Needs real design, not a copy.
3. **Word-level sync** needs word timings. The owner's real transcript (see assets) is
   utterance-level (`**Speaker** [mm:ss]`); we define a schema that carries word timings and
   speakers, and interpolate words within an utterance until whisper gives true stamps.
4. **Global playback model** — many bars on a page, split-view player, one-plays-at-a-time.
5. **Record vs import** capture gesture (MediaRecorder) — design now, scope later.

## Decided up front
- **Transcript sidecar**: `media/<noteId>/<mediaId>.<ext>.transcript.json` (same dir + stem as
  the audio; `.ext` kept so `a.mp3`/`a.wav` don't collide). Loaded when the audio ref is
  resolved. JSON schema locked in wiki.md. NOT written into the `.md`.
- **Search**: extend `Store.bodies()` (both adapters) + the incremental path in
  `useSearchIndex.ts` to append referenced-transcript text to each note's body doc.
- **Prototypes are interactive `.html`** (NOT artifacts), opened locally, playing the **real
  19-min sales call** against the **real transcript** (`prototypes/assets/`), so sync, scrub,
  and the split view can actually be judged.

## Roadmap (phased)
- **P0 — Recon & scaffold.** ✅ DONE.
- **P1 — UX exploration.** ✅ DONE — 7 interactive prototypes (`prototypes/`), owner-judged.
- **P2 — Lock the design.** ✅ DONE — `prototypes/design-spec.md` ⚑ block is the contract.
- **P3 — Audio block (inline).** ✅ DONE — `AudioBlock.tsx` + `lib/md/audio.ts` fence + `/audio`
  slash + playback controller (one-plays-at-a-time) + full-width fix. Tests green.
- **P4 — Transcript sidecar + search.** ✅ DONE — `lib/transcripts/*`, store load/save,
  `bodies()` folds transcript text into Accio. Segment-aware sync. Tests green.
- **P5 — Transcript views.** ✅ DONE (+P5.1 polish) — `TranscriptView`, `TranscriptSplit`
  (resizable pane) + inline Dropdown reader, word-sync, click-to-seek. **← owner testing now.**
- **P6 — Recording + gallery card + Accio hit + reindex.** ◧ IN PROGRESS (reindex + recording done).
  - **Recording:** `/audio` → live recorder bar (MediaRecorder; waveform fills; Recording·m:ss;
    stop → Saving (gold) → settled bar). Reuse `saveAudioFile`. Per prototype `02-capture.html`.
  - **Gallery waveform card:** audio inside the justified gallery as the improved self-contained
    waveform card (controls under the waveform, scales with row height, transcript→split). Per
    `03-in-gallery.html`. Touches `ImageGroupBlock`/gallery model to allow an audio entry kind.
  - **Accio transcript-hit affordance:** show transcript matches as ∿ + timecoded jump-lines
    that open the split at that word. Per `05-accio-hit.html`. Touches `features/summon` +
    `lib/search` (carry which audio ref + timecode a body match came from).
  - **Auto-reindex-on-create:** when `createTranscript` writes a sidecar, trigger the search
    index to refold that note (today only a full `bodies()` rebuild picks it up).
  - **Home/flask recognition** (`06-home-flask.html`): duration chip on FlaskCard; transcript
    text contributes to flask fill. (Lower priority — can slip to a follow-up.)
- **P7 — Verify on device + merge.** `npm run build` → **`npm run tauri:build`** (NOT run yet);
  confirm on the native `.app` (per memory `merge-and-build-each-change`); merge to `main`;
  rename folder `- OPEN` → `- CLOSED`. Replace the DEV transcript seed if whisper has landed.

## Live status
- **2026-10-16 (P0 done):** research grounded; assets ready (`audio.mp3` gitignored +
  `transcript.json` 206 seg / 2,390 words / 2 speakers + baked `peaks.json`).
- **2026-10-16 (P1 DONE — awaiting owner judging):** UX lead shipped the design language +
  shared kit (`_kit.css`) + engine (`_audio.js`) + `design-spec.md` contract + `00-overview.html`.
  Six per-surface prototypes built, all live against the real call, all open by double-click:
  `01-inline-bar`, `02-capture`, `03-in-gallery`, `04-transcript-split`, `05-accio-hit`,
  `06-home-flask`, tied together by `prototypes/index.html` (the entry point to judge).
- **2026-10-16 (P2 — design LOCKED):** owner reviewed all prototypes and locked every decision
  (see the ⚑ LOCKED block at the top of `design-spec.md`). 02/05 approved as-is; 06 approved
  (duration chip + transcript text fills the flask). Refinement pass on 00/01/03/04 in flight:
  uniform bar height (broken bar was too tall); ⋯ menu always offers Create/**Regenerate**
  transcript + **two** reader openers (split default, reader); gallery → improved **waveform
  card** (controls under the waveform, no title/dock, transcript→split only); split view strips
  the meta chips + "click a word" hint, drops the transcript button, adds a **Collapse split
  view** button + better close. Scope confirmed: **recording ships now**; transcription engine
  is the only stubbed piece (UI trigger present).
- **2026-10-17 (P3 DONE — inline AudioBlock):** built the standalone audio element + wired it
  into the editor. New: pure engine `src/lib/audio/` (`time` fmt, `peaks` resample + best-effort
  Web-Audio compute + deterministic placeholder, `controller` registry with one-plays-at-a-time
  + shared-playhead ref-counting); presentational `src/components/audio/` (`AudioBar`, `Waveform`
  canvas/HiDPI/scrub, `icons`, `audio.css`); BlockNote adapter `AudioBlock.tsx` (empty→file-picker,
  saving, loaded, broken states + ⋯ menu per locked spec) mounting the bar; md bridge
  `lib/md/audio.ts` (`pensieve:audio` fence) wired into `extended.ts` + the resolve pass in
  `image.ts`; `audio` registered in `editorSchema.ts`; `/audio` slash item + `AudioLines` icon;
  `insertAudio.ts` (audio MIME→ext + saveAudioFile). Tests: audio `.md` round-trip (real editor)
  + time/peaks units — 798/798 pass; `tsc` clean; web bundle builds. Transcript icon = "absent"
  for now (presence/open wire in P4/P5); transcription engine stays a stub.
- **2026-10-17 (P4 DONE — transcript sidecar + search):** `src/lib/transcripts/` — the locked
  `Transcript` type, `transcriptRefFor` (`<audioRef>.transcript.json`), `transcriptPlainText`,
  `parseTranscript`, and the **segment-aware** `syncAt`/`wordStart`/`flatWordIndex` (binary-search
  sorted segment starts then word-within — the multitrack-overlap fix). Store gained
  `loadTranscript`/`saveTranscript` (Tauri: read/write_text sidecar; Browser: localStorage), and
  `bodies()` in BOTH adapters now folds each referenced recording's transcript text into the
  note's search corpus → spoken words are findable in Accio (transcripts stay sidecars, never in
  the `.md`). Tests: sync monotonic over the real 206-seg call (0 backward events), parse/plaintext/
  path, and bodies()-folding on the browser store — 809/809 pass; tsc clean.
  NB: the full index build (bodies()) picks up transcripts; when "Create transcript" writes a
  sidecar (P6) it must trigger a note reindex (the `.md` doesn't change) — wire that in P6.
- **2026-10-17 (P5 DONE — transcript views):** `TranscriptView` (word-synced reader body:
  speaker turns, segment-aware highlight via incremental DOM class toggles so 2,390 words stay
  smooth, click-word-to-seek, auto-scroll while playing, speakers by weight/tone). Two
  presentations: **Split to Transcript** = `TranscriptSplit` resizable right pane (dock AudioBar
  on top + TranscriptView), opened via the `transcriptController` pub/sub, mounted in `App.tsx`
  body row, draggable divider (360px–70vw), Collapse (button + Esc) fully restores the centered
  editor; **Dropdown Transcript** = inline expand below the bar inside `AudioBlock` (height-
  adjustable grip, own collapse). Added a borderless `dock` AudioBar variant. **"Create
  transcript" dev-seeds** the bundled real-call sample (`_sampleDominik.dev.json`, dynamic import
  → code-split) so the UX is testable now; swap for whisper later (then delete the sample +
  the dev seed). 809/809 pass; tsc clean; build OK.
  → **NEXT: owner tests P5 live; then P6 — recording + gallery card + Accio hit; P7 device-verify + merge.**
- **2026-10-17 (P6.1 DONE — auto-reindex-on-create):** `buildSearchBody(markdown, loadTranscript)`
  is now the ONE definition of a note's searchable text (markdown + folded transcript sidecars);
  both `Store.bodies()` adapters + the single-note reindex use it (also fixed a latent bug: the
  incremental edit path indexed bare markdown, dropping transcript words). New
  `reindexController` pub/sub (mirrors transcriptController): `createTranscript` →
  `reindex.request(noteId)` after the sidecar write → `useSearchIndex` refolds just that note
  (no-op until the index is built — the cold build folds everything). Tests: buildSearchBody
  fold/multi-ref, reindexController pub/sub. 822 pass.
- **2026-10-17 (P6.2 DONE — live recording):** the recorder IS the inline bar. `/audio` empty
  block → **Record** (primary) + *choose a file* (secondary, owner's call — reversible). Record
  drops `RecordingBar` in place: accent Stop square, live waveform, elapsed clock, optional
  pause, "Recording · m:ss"; stop → Saving → settles into the playable bar. New: DOM-free
  `src/lib/audio/recorder.ts` (getUserMedia + MediaRecorder + AnalyserNode; unit-tested
  `RecordingClock` pause math; MIME picker Opus/WebM→mp4/aac), shared
  `src/lib/audio/waveformPaint.ts` (the one bar painter — Waveform refactored onto it, kills
  the duplicate draw loop), `RecordingBar.tsx`. `saveAudioFile` already took a Blob; fixed
  `audioExtForFile` to strip MediaRecorder's `;codecs=` suffix. 831 pass; tsc clean; build OK.
  **Native mic (WKWebView) needs the macOS entitlement — verify in P7. Browser dev works now.**
  **Remaining P6: gallery waveform card (P6.3) · Accio transcript-hit jump-lines (P6.4) ·
  home/flask (P6.5, lower priority).**
- **2026-10-17 (P6.2a — drag only by the gutter handle):** grabbing the bar/recorder body
  node-selected the void block and PM dragged it into a duplicate. Native `dragstart` stopper
  on every state's blockwrap (beats PM's root handler); the 6-dots gutter handle lives outside
  the block body so it stays the sole drag path. Only dragstart touched → ⋯ menu's outside-click
  close (document mousedown) still works. Owner-confirmed.
- **2026-10-17 (P6.4 DONE — Accio transcript-hit jump-lines):** searching a spoken word shows
  timecoded jump-lines under the result card; click → opens the note + transcript split seeked
  to that moment. `transcriptMatches.ts` (pure, tested) mirrors the index match rule (token
  CONTAINS term, diacritic-sensitive) so jumps align with what Accio surfaced; word-level when
  word timings exist, else segment-level. `useTranscriptHits` hook lazily resolves jumps only
  for `where:"text"` results (skips image refs; off the main search path → grid stays cheap).
  `TranscriptJumpLines` renders as a sibling of `FlaskCard` (card root is a <button>). Seek-on-
  open: `TranscriptOpenReq.seekTo` → `TranscriptView` seeks+plays once there (waits for
  metadata; re-fires on a second jump). 837 pass; tsc clean; build OK.
  **Remaining: P6.3 gallery waveform card (the big one — touches the editor gallery block /
  ImageGroupBlock model) · P6.5 home/flask (lower priority). Then P7.**
- **2026-10-17 (voice memo = no title):** a title-less note (voice memo / media-only) now has
  NO title anywhere it's browsed — titleFromMarkdown returns "" (skips fenced blocks + lone
  image lines), gallery card & tabs omit the title (just the flask), reference labels
  (note-links / @-menu) keep an "Untitled" handle since a link needs something to point at.
- **2026-10-17 (P6.3 DONE — gallery waveform card):** audio rides the editor's justified image
  strip as a compact `WaveformCard` (waveform over play·time·transcript controls; fixed aspect
  1.85; scales with the row-height drag like a photo; plays in place; transcript → split only).
  `GalleryAudioTile` is the editor adapter (loads the sidecar, opens the split). Model: `GalleryImage`
  gains optional `kind:'audio'`; the fence carries audio lines with an `audio:` sigil (additive —
  legacy image fences unchanged). Geometry: audio = a FIXED aspect in the justify input, zero
  packer change. Insert: the gallery drop filter + '+' input accept `audio/*`; persistTiles
  dispatches `saveAudioFile` vs `saveImageFile` by MIME. 841 pass; tsc clean; build OK.
  **ALL P6 build features done except P6.5 (home/flask duration chip — lower priority). Then P7.**

### Agent recommendations to carry into P2
- #1 gallery: **Option C** (waveform-card tile → opens canonical bar in a "Now playing" dock).
- #2 transcript: **split on desktop**, full overlay only when narrow / phone.
- #3 capture: **inline bar** is the recorder (one component). Open: does recording ship now?
- #4 speakers: **weight/tone**, optional faint border-rail (no 2nd hue).
- #5 polished/raw: **show polished**, raw a later dock toggle.
- Smaller: record/stop control is **accent not red** (owner may override); Basin `Space`
  pins-peek vs plays-bar needs an owner; Accio ranks transcript hits at body-tier.

### Engine correctness note (fix at build time / P3)
The reference word-sync (`00-overview.html` `buildTranscript` flat word binary-search) assumes
globally monotonic word starts. This recording is `diarization:"multitrack"` — 9/205 segments
overlap (speakers over each other), so flat search mis-highlights at ~2 seams. `04-transcript-
split.html` already fixes it via **segment-aware** sync (`sync().at()` → seg,word → flat offset;
verified 0 backward events over a 0.1s sweep). **Fold this into `_audio.js` when building.**

## Decisions / open questions for the owner (at P1 judging)
See "Agent recommendations" above — the 5 numbered decisions + smaller calls, each made
tangible by a prototype (index.html links them). P2 cannot start until these are answered.
