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
- **P0 — Recon & scaffold.** ✅ Codebase mapped (editor/gallery, search/index, shell/surfaces);
  test `.mov`→`.mp3`; real transcript parsed to the locked JSON schema; update folder up.
- **P1 — UX exploration (CURRENT).** UX/UI lead defines the overall audio+transcript design
  language + a shared prototype kit; then one focused agent per surface, each shipping an
  interactive `.html`. Surfaces: (A) inline bar + states, (B) record/capture, (C) audio in
  gallery, (D) transcript Split View, (E) Accio hit, (F) home/flask recognition. → owner judges.
- **P2 — Lock the design.** Fold owner feedback; freeze dimensions, states, interaction,
  playback model, split-view behavior. Define `TranscriptView` + `AudioBlock` component APIs.
- **P3 — Audio block (inline).** `AudioBlock.tsx` + `lib/md/audio.ts` (`pensieve:audio` fence)
  + `kind:"audio"` + MIME→ext + slash item. Renders in Editor, NotePreview, time-travel.
  Playback controller (one-plays-at-a-time). Tests: md round-trip, byte-compat guard.
- **P4 — Transcript sidecar + loading.** `lib/transcripts/` (type + load/save via
  `read_text`/`write_text`), resolve on ref. Search: extend `bodies()` + `useSearchIndex`.
  Tests: load, search includes transcript, missing-sidecar = graceful.
- **P5 — Transcript Split View.** Resizable split pane in the shell; `TranscriptView`
  (player on top, word highlight synced, click-word-to-seek, speakers). Open from inline bar
  via the pub/sub seam.
- **P6 — Audio in gallery + ⋯ menu + capture.** Per locked design. Download, create-transcript
  (stub → wired when transcription lands).
- **P7 — Verify on device + merge.** `npm run build` → `tauri:build`; confirm on the native app;
  merge to main; rename folder CLOSED.

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
  → **CHECKPOINT before P5 (the visible split/reader views — owner's eyes matter most there).**

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
