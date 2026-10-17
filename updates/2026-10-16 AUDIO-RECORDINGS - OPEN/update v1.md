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

## ▶ RESUME HERE (for the next session / new AI) — updated 2026-10-17
**Branch:** `update/audio-recordings` (pushed to origin; branched off `main`). **Not yet merged.**
**Design is LOCKED** by the owner (see the ⚑ block at the top of `prototypes/design-spec.md` —
that file is the binding build contract). Prototypes to see the intended UX:
`prototypes/index.html` (opens the 7 interactive `.html`, run against the real call).

**Done & pushed:** P0 research · P1 UX (7 prototypes) · P2 locked design + refinements ·
**P3** inline AudioBlock (play/wave/scrub/time/⋯ menu, `/audio` slash, `pensieve:audio` fence) ·
**P4** transcript sidecar load/save + Accio search folding · **P5** transcript views
(Split pane + inline Dropdown reader, segment-aware word-sync) + P5.1 polish.
**Tests: 809/809 pass · `tsc` clean · web build OK. Native `tauri:build` NOT yet run (that's P7).**

**NEXT = P6** then P7 (see roadmap below). In P6, also wire **auto-reindex-on-create** (writing a
transcript sidecar doesn't change the `.md`, so the search index must be told to refold — today
it only refolds on a full `bodies()` rebuild).

**How to test what's built (browser dev is enough):** `npm run dev` → http://localhost:5173 →
in a note type `/audio` → **Choose an audio file…** → pick
`updates/2026-10-16 AUDIO-RECORDINGS - OPEN/prototypes/assets/audio.mp3` (the real 19-min call) →
bar plays/scrubs. Then **⋯ → Create transcript** (DEV-seeds the bundled real transcript) → the
transcript icon turns accent → **transcript icon / ⋯ "Split to Transcript"** opens the right pane
(play → words highlight, click a word to seek, drag divider, Collapse/Esc); **⋯ "Dropdown
Transcript"** expands the reader inline (drag grip to resize, drag-select to copy). Search a spoken
word in Accio (e.g. `problém`, `partnerku`) → the note matches on transcript text.

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
