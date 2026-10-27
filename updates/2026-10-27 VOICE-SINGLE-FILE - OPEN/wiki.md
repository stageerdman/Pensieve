# VOICE-SINGLE-FILE — wiki

## Decision: raw PCM over MediaRecorder for phone voice capture
MediaRecorder on WebKit (iOS Safari / WKWebView) cannot be timesliced AND cannot be safely
restarted mid-take without either (a) producing fragments that silently fail to decode once
concatenated, or (b) producing several independently-valid-but-separate files (what
VOICE-PLAYBACK-FIX, 2026-10-26, shipped as "Part N of M" blocks — a correctness fix that traded
one visible bug for a different visible bug). There is no robust way to get ONE file out of
MediaRecorder on WebKit across a take longer than one segment.

Raw PCM captured via `ScriptProcessorNode` sidesteps the entire problem class: PCM has no
container framing, so chunks written to IndexedDB in order are byte-identical to the final
output when concatenated — finalize just needs to prepend one 44-byte WAV header. This also
deletes a whole category of state machine (no segment rotation timer, no `opChain` to serialize
stop/start races, no "which recorder is current" guard) — pause/resume became a one-line flag
flip instead of a stop+restart dance.

**Lesson for future WebKit audio work**: if a requirement is "exactly one continuous file," do
not reach for MediaRecorder at all on this platform. Go straight to Web Audio PCM capture.
MediaRecorder on WebKit is fine ONLY for single start/stop takes with no splitting requirement
(that's still how desktop's `src/lib/audio/recorder.ts` records, and it works there — see
AUDIO-RECORDINGS — because desktop never needed segment rotation in the first place).

## Trade-off: WAV size vs. m4a size
~1.9MB/min (mono, 16-bit, 16kHz) vs. ~1MB/min for the old m4a/AAC. Resampling capture down to
16kHz (from the mic's native 44.1/48kHz) both bounds this and matches what the local Whisper
transcription models already expect as input — one less implicit resample in the transcription
path. A future optimization (not done here) would be a background re-encode to AAC after the
fact once the file is safely on disk as one correct WAV; deliberately not built now — no second
problem to solve yet, and encoding-after-the-fact is strictly easier than encoding during
capture (no realtime constraint, can shell out to ffmpeg/etc. at leisure).

## Legacy orphan compatibility
A session created by the PRE-upgrade build (MediaRecorder segments) could still be sitting
unfinalized in IndexedDB if a crash happened right before this update's rollout. `recordingStore
.RecordingSessionMeta.mimeType` is the discriminator: this build always writes `"audio/wav"`;
anything else hitting the recovery sweep is legacy and goes through `finalizeLegacySegments`
(the old per-chunk / "Part N of M" logic) instead of being run through `buildWavBlob`, which
would otherwise silently wrap old MediaRecorder bytes in a WAV header and produce garbage. Safe
to delete that fallback path once satisfied no pre-upgrade session could still be orphaned.

## Why ScriptProcessorNode and not AudioWorklet
AudioWorklet is the modern replacement and avoids main-thread audio processing, but requires a
separate module script file loaded via `audioContext.audioWorklet.addModule(url)` — more
deploy/bundling surface for a PWA that's supposed to stay lightweight. Backgrounding already
fully stops capture immediately (`onBackgrounded`) rather than trying to keep recording while
hidden, so AudioWorklet's main real advantage here (robustness across tab throttling / background
threads) doesn't apply. ScriptProcessorNode is deprecated but still implemented everywhere this
app runs (iOS Safari, WKWebView) and needs zero extra build config.
