# PHONE-AUDIO-TRANSCRIPT — update v1

## Goal
A desktop-recorded voice memo currently shows on the phone as a raw ```pensieve:audio ... ```
fence (the phone's note parser never learned that fence — same class of gap as the image-fence
bug fixed in [[phone-markdown-rendering-gap]]). Fix that, AND give the phone its own simple
playback experience:
- **Inline**: reuse the desktop `AudioBar`'s visual language (play/pause, progress, time,
  transcript icon) — a quieter phone-sized version, no waveform/menu/record (phone capture is a
  separate future update).
- **Transcript**: when a sidecar transcript exists, tapping the transcript icon opens a
  **full-screen, Spotify-style** view — a pinned mini player (play/pause + progress) with the
  transcript text filling the rest of the screen. Something simple: no live word-highlight, no
  split view (that's desktop-only) — just read the transcript while the recording plays,
  continuing on the SAME playhead as the inline bar.

## Why this wasn't already possible
Phone sync has no concept of a transcript at all — a sidecar (`<audioRef>.transcript.json`)
only ever gets pulled if something asks for it by name; `extractMediaRefs` only walked
image/gallery refs, so an audio ref (and therefore its sidecar) was never requested either.
Desktop already backs up sidecars for free (its generic `listMedia` walks every file under
`media/<noteId>/`, no extension filter) — so the data is already on OneDrive, phone just never
asked for it.

## Model
- `phone/src/lib/media/noteMedia.ts`: new `audio` NoteBlock kind, `pensieve:audio` fence
  parse/encode (ref + optional caption, mirrors `image`'s fence shape minus width/aspect).
- `phone/src/lib/sync/engine.ts`: `extractMediaRefs` requests the audio ref AND
  `transcriptRefFor(ref)` — the existing `pullReferencedMedia`/404→null path already no-ops
  cleanly when no transcript exists, so no new sync machinery, just two more ref strings.
- `phone/src/lib/media/transcript.ts`: pure port of `src/lib/transcripts/transcript.ts`'s
  `transcriptRefFor`/`parseTranscript` + the `Transcript`/`TranscriptSegment` shape (same
  decouple convention as `noteMedia.ts` vs. desktop's `lib/md`).
- `phone/src/lib/media/audioController.ts`: pure port of `src/lib/audio/controller.ts` (keyed
  registry, one HTMLAudioElement per ref, one-plays-at-a-time, WebM/fragmented-mp4 duration
  self-heal). Framework-free — the file's own header already calls this "portable to the phone
  app," so it's a near-verbatim copy, not a redesign.
- Inline render: `mediaDom.ts` grows `buildAudioEl` — a `.ph-media.ph-audio` block (play button,
  progress track — tap-to-seek, no drag-scrub v1 — time, transcript icon enabled once the
  sidecar resolves present).
- Full screen: `phoneTranscriptReader` controller (open/close/subscribe, same shape as
  `lightboxController`/`collectionController`) + `PhoneTranscriptReader.tsx` mounted at the app
  root next to `PhoneLightbox`/`PhoneCollection`. Shares the inline bar's controller BY REF, so
  opening the reader doesn't restart or duplicate playback.

## Phased roadmap
- **Phase 0** — `pensieve:audio` fence support in `noteMedia.ts` (parse/encode/preview-strip) +
  the sync backfill (audio ref + transcript sidecar ref). Fixes the raw-fence bug on its own,
  independent of any UI.
- **Phase 1** — inline playback: ported `audioController.ts` + `buildAudioEl` (play/pause,
  progress, time; transcript icon present-but-disabled until a sidecar resolves).
- **Phase 2** — the full-screen reader: `transcriptReaderController` + `PhoneTranscriptReader`,
  wired to the inline block's transcript icon, mounted at the app root.
- **Phase 3** — tests, `tsc`/`vitest`/`build:phone` clean, deploy, docs, close-out.

## Decisions
- No waveform, no record-from-phone, no menu (download/replace/remove), no split view — phone
  capture is future work and the owner explicitly asked for "something simple."
- No segment-level highlighting or tap-to-seek-by-line in the reader v1 — plain paragraphs,
  speaker label prefixed only when the segment is diarized (`speaker !== null`).
- Progress bar is tap-to-seek, not drag-to-scrub — matches the "simple" brief; a fast-follow if
  the owner wants scrubbing later.
- One shared controller per audio REF (not a synthetic block id) — two audio blocks can never
  share a ref (each recording mints its own file), so this is simpler than desktop's `block.id`
  key and still gives every distinct recording its own independent playhead.

## Live status
- Opened 2026-10-26. Building Phase 0 now.
- **All phases built and shipped to main** (`280b8c9` Phase 0, `4218f3b` Phase 1+2), deployed via
  `npm run deploy:phone`. Full suite 1004 tests pass (+22 new: noteMedia audio fence, transcript
  pure helpers, engine sidecar-backfill, mediaDom render/round-trip); `tsc` (both apps) and
  `build:phone` clean.
- Hit one real bug mid-build: a dangling-else in `extractMediaRefs`'s existing (brace-less)
  gallery branch silently absorbed the new audio `else if` as ITS OWN dangling else, so the
  audio branch was unreachable despite every piece (parseNoteContent, isMediaPath) working
  correctly in isolation when tested directly. Found via a failing integration test + step-by-
  step debug logging; fixed by bracing every branch. See the commit message for the full story
  — worth remembering as a class of bug (an unbraced `if` inside a brace-less branch "steals" a
  later `else if` that looks like a sibling).
- **NOT device-tested yet** — this is phone UI/gesture code (tap-to-seek, the transcript icon
  reveal, the full-screen reader), same class of surface that's bitten us before (see the
  GALLERY-PINTEREST update's gesture-bug history). Needs the owner to actually play a real
  recording on the device before calling this done.
- **Deliberately deferred** (per the brief — "something simple"): no phone audio capture/record,
  no waveform, no download/replace/remove menu, no drag-to-scrub (tap-to-seek only), no live
  segment/word highlight in the reader, no split view. All desktop-only or explicit fast-follows
  if the owner wants more later.
- NEXT: owner device-tests — open a note with a voice memo (desktop-recorded), confirm the inline
  bar plays/pauses/seeks, the transcript icon appears once the sidecar lands, and the full-screen
  reader opens with continuous (not restarted) playback. Then close this folder.
