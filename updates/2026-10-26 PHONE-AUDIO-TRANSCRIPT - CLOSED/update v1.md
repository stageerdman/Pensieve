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

## Live status (2026-10-26, same day — owner device test: 3 real bugs found + fixed)
- Bullets: owner-CONFIRMED fixed (the Tailwind-preflight round from earlier today).
- Owner tested audio: most recordings showed 0/0 and wouldn't play; ONE played fine with a real
  duration. **Root cause found & fixed** (`ca53e77`): `vault.ts`'s `writeMediaBytes` stored every
  synced media blob via `new Blob([bytes])` with NO MIME type — Safari's `<audio>` needs a real
  type to pick a decoder; one recording's container happened to still decode by content-sniffing
  while m4a files silently failed (duration stuck, play() a no-op). `adapter.ts`'s
  `mediaContentType` extension table only had IMAGE types (never audio) — added
  m4a/mp3/wav/webm/ogg/aac and now pass it into the Blob on write.
  **Caveat for the owner**: this only fixes FUTURE downloads — the two already-pulled m4a blobs
  in IndexedDB still carry the old untyped Blob and won't self-heal from a normal sync (`have.has
  (ref)` skips a ref already present locally). A one-time "restore from cloud" (if exposed in the
  phone sync UI) re-pulls everything and will pick up the fix; otherwise they're stuck broken
  until that media is cleared/re-pulled some other way.
- Buttons made bigger (play 34→44px, transcript 28→36px, taller bar) per "make it look like it
  expanded the row a bit more."
- Transcript reader: owner reports not scrollable. Added a defensive `min-height:0` +
  `touch-action:pan-y` to `.ph-reader-body` (WebKit sometimes doesn't fully honour the spec's
  "auto min-size is 0 when overflow isn't visible" exception for a flex child) — `-webkit-
  overflow-scrolling:touch` was already present. UNVERIFIED whether this was a real bug or a
  short-transcript-fits-on-screen false alarm (same ambiguity as the collection scroll report
  earlier) — no custom touch-intercepting JS on this element, unlike the collection, so there's
  less surface area for this to be gesture-code-wrong; most likely either the CSS fix above or
  genuinely not enough content to scroll. Needs retest with a longer transcript to know for sure.
- Full suite 1008 tests, `tsc` (both apps) and `build:phone` clean. Deployed.
- NEXT: owner retests on device — a FRESH recording (new m4a pull) for the duration/play fix, a
  longer transcript for the scroll claim, and the bigger buttons for feel.

## Live status (2026-10-26, later same day — scroll fix found, shared with GALLERY-PINTEREST)
- Owner correctly guessed the transcript-scroll report was "the same problem as the gallery."
  It was: found a single global touch guard in `PhoneApp.tsx` that only allows scroll/swipe
  inside `.reel`/`.note`/`.search-results` — the reader (`.ph-reader`), like the lightbox and
  collection, is mounted as a SIBLING of `.note` at the app root, so it never matched and every
  touch inside it was blocked. Fixed `7503e2e` (added `.ph-reader` to the allowlist) — full
  detail + the shared history with the gallery's scroll/swipe bugs is in GALLERY-PINTEREST's
  2026-10-26 entry and memory [[phone-global-touch-guard-allowlist]]. The defensive
  `min-height:0`/`touch-action` CSS added earlier today was harmless but NOT the actual fix.
- NEXT: same device retest as above, now including the reader's scroll specifically.

## CLOSED (2026-10-26) — owner-confirmed: "perfect, working."
Phone now plays a desktop-recorded voice memo inline (play/pause, tap-to-seek, time) and opens
a full-screen Spotify-style transcript reader once a sidecar transcript is found — both
confirmed working on device after fixing the untyped-Blob audio bug and the shared global
touch-guard allowlist bug (see GALLERY-PINTEREST's close-out for that one; it affected the
reader's scroll too).

**Deliberately NOT built** (per the owner's "something simple" brief, not deferred/forgotten):
phone audio capture/recording, a waveform, a download/replace/remove menu, drag-to-scrub
seeking, live word/segment highlighting in the reader, desktop's split view. All explicit
fast-follows if ever wanted — see the Decisions section above.

Closing this folder now per the owner's call.
