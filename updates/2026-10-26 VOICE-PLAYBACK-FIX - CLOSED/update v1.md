# VOICE-PLAYBACK-FIX

## Goal
CAPTURE-SPELLS shipped a "fix" for the phone's recorded audio showing a stuck "0:00 / 0:00"
(MIME-tagging + a duration self-heal), but that fix was never verified on a real device — it
was reasoned from code alone. The owner confirms on-device that new recordings still can't be
played at all (tap play, nothing happens). This update finds and fixes the real root cause.

## Root cause
Confirmed via web research (not just code reading) that WebKit's `MediaRecorder` for
`audio/mp4` only produces a reliably decodable file when `start()` is called with **no
timeslice** and `stop()` is called with **no preceding `requestData()`**. Our engine
(`voiceCapture.ts`) did both — `recorder.start(TIMESLICE_MS)` every 3s, plus an explicit
`requestData()` right before the final `stop()` — to get crash-safe incremental flushes to
IndexedDB. That is exactly the known-bad pattern: the resulting chunks are MP4 fragments that
silently fail to decode once concatenated into one Blob, regardless of correct MIME tagging.
See `wiki.md` for sources.

## Fix
Replace timeslice-based chunking with **segment rotation**: every 30s (`SEGMENT_MS`), cleanly
`stop()` the current `MediaRecorder` and `start()` a brand-new one on the same `MediaStream`.
Each segment is therefore a fully standalone, independently finalized, guaranteed-playable file
— never a fragment. Pause/resume now close/open a segment boundary (a pause was already meant
to be a safe checkpoint; now it also guarantees a playable one). Finalize stores one
`pensieve:audio` block per segment (captioned "Part N of M" when a take spans more than one
segment) instead of trying to glue fragments into one Blob — `pensieve:audio` already supports
multiple blocks per note, so no format/sync change was needed.

Trade-off, stated plainly: a crash now loses at most the current ~30s segment instead of ~3s.
Given the old scheme produced files that didn't play AT ALL, this is a straightforward win —
but it's a real, intentional regression in that one number, not a free fix.

Also added: the audio player now listens for a decode `error` on the underlying element and
shows "Can't play this recording" (+ logs `audio:playback.undecodable`) instead of staying
silently stuck — so a future playback bug is diagnosable from the log store instead of invisible.

## Known limitation
Recordings already saved to the vault BEFORE this fix (old timesliced files) are not
retroactively fixable — the broken bytes are already on disk. Only new recordings made after
this fix are affected by it. The owner was told this directly.

## Status
- [x] Root-caused via code read + external research (not guessed blind)
- [x] Implemented segment-rotation engine in `voiceCapture.ts`
- [x] Added visible/logged error state for undecodable audio (`audioController.ts` + `mediaDom.ts`)
- [x] Typecheck + full test suite green (1015 tests)
- [x] Merged to main + phone PWA deployed
- [ ] Owner device verification (nothing in this dev environment can exercise real
      MediaRecorder/mic capture — same limitation as CAPTURE-SPELLS)
