# VOICE-PLAYBACK-FIX — wiki

## The actual root cause (sourced, not guessed)
Web search turned up a matching real-world case: a PR titled "Fix Safari vocal takes with
single finalized recording blobs" whose root cause write-up is word-for-word our bug:

> Safari's MP4 MediaRecorder was being run with a timeslice and an explicit requestData()
> before stop, producing fragmented MP4 chunks that are not reliably decodable/playable when
> concatenated.

> The fix records each vocal take as one finalized MediaRecorder file by using start() with no
> timeslice and no pre-stop requestData().

That is exactly our `voiceCapture.ts` before this update: `recorder.start(TIMESLICE_MS)` (3s
timeslice) plus `recorder.requestData()` immediately before `recorder.stop()`. The CAPTURE-SPELLS
fix (MIME-tagging the Blob with `recorder.mimeType`, self-healing `duration === 0`) addressed
real but secondary issues — it never touched the actual unplayable-when-concatenated fragment
problem, which is why the owner still saw a dead player after that fix shipped.

Per the W3C MediaRecorder spec, concatenating timesliced `dataavailable` Blobs in order IS
byte-identical to a single no-timeslice recording — so in THEORY concatenation should be safe.
In practice, WebKit's `audio/mp4` implementation doesn't honor that for timesliced/requestData
chunks; only a clean, un-timesliced `start()`→`stop()` cycle reliably bakes a valid `moov`/
duration into the result. This is a WebKit-specific gap, not a spec violation we're working
around elsewhere — Chromium's webm chunks genuinely do concatenate fine, which is likely why
this class of bug is specific to Safari/iOS (our only real target).

## Decisions
- **Segment rotation over fragment-chunking.** Every `SEGMENT_MS` (30s), stop the current
  recorder cleanly and start a fresh one on the same `MediaStream` (no new `getUserMedia`
  prompt). Each segment is a complete, independently-valid file. Pause/resume is just a forced
  segment boundary — it was already meant to be a safe checkpoint, so this is free.
- **Multiple `pensieve:audio` blocks over blob-stitching.** Decoding every segment with
  `AudioContext.decodeAudioData` and re-encoding one WAV was considered and rejected: it holds
  the ENTIRE take in memory as raw PCM, which fights the explicit "multi-hour recording" goal
  (a multi-hour take could be hundreds of MB to a few GB of PCM in memory — real OOM risk on a
  phone, i.e. the exact crash this feature exists to survive). Sequential captioned blocks are
  zero extra memory, 100% correctness, using plumbing (`pensieve:audio` multi-block, sync's
  `extractMediaRefs`) that already existed and already works.
- **30s segment length.** A balance: long enough that a normal short voice note is still one
  single block (no "Part 1 of 1" captions — only captioned when `total > 1`), short enough that
  a crash mid-take loses a bounded, small amount. Easy knob to revisit if the owner wants finer
  crash granularity or fewer "Part N" splits on long takes.
- **Visible/logged decode errors.** The old symptom ("nothing happens" on tap) was undiagnosable
  — `audioController.ts`'s `play()` already swallowed `NotSupportedError` silently (by design,
  to not fight autoplay-gesture rejections), and nothing listened for the element's `error`
  event at all. Added an `error` `AudioEvent` + `errorCode` getter; `mediaDom.ts` now shows
  "Can't play this recording" and logs `audio:playback.undecodable` with the `MediaError` code.
  If some OTHER decode edge case turns up later, this makes it visible instead of silent.

## What's NOT verified (same limitation as CAPTURE-SPELLS)
jsdom has no `MediaRecorder`/`getUserMedia`/`IndexedDB`, so the actual segment-rotation engine —
real mic capture, the stop/start handoff on a real `MediaStream`, pause/resume across segment
boundaries, backgrounding mid-segment — can only be verified on a real iPhone. Typecheck and the
full test suite (1015 tests) are green; the pure logic (`RecordingClock`, `fmtElapsed`) is
unit-tested as before. Needs an owner device pass after deploy. Old recordings made before this
fix remain unplayable — their bytes are already corrupted on disk; this only prevents NEW ones
from breaking.
