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
- **2026-10-16:** P0 done. P1 launching: UX lead first (design language + kit), then 6
  per-surface prototype agents. Assets ready: `prototypes/assets/audio.mp3` (real 19-min call,
  gitignored) + `transcript.json` (206 segments / 2,390 word-timings / 2 speakers).

## Decisions / open questions for the owner (at P1 judging)
- Audio-in-gallery treatment (full-width bar band vs compact tile vs pulled-out) — prototype C.
- Split View: resizable pane vs full overlay; does it replace the Details/Timeline dock or
  coexist — prototype D.
- Does "create transcript" / recording ship in this update or wait for the transcription step.
