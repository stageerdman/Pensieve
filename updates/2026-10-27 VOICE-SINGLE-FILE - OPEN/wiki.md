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

## A phone call during a recording (2026-11-20)
Reported: a call came in mid-take, was declined; the timer kept running but nothing was
captured, and the saved file showed err=4. Cause: nothing listened for the OS taking the audio
session. On iOS a call moves the AudioContext out of "running" ("interrupted"), mutes the mic
track and the ScriptProcessor just stops calling back — no error anywhere — and WebKit often
leaves that track/context dead after the call. Fix (`captureWatch.ts`): any of context
interrupted / track muted / track ended / no callbacks for 3s → pause the take with the mic
released (same path as session mode's lock-pause), say so in the panel, and Resume re-opens a
fresh mic into the SAME session, so it is still one file.
Also closed on the way: chunks were still stored as IDB Blobs (the same WebKit lazy-blob bug
mediaStore already fixed) — now ArrayBuffers; a failed chunk read used to look like "zero
chunks" and delete the session, and a failed WAV write still added a block and deleted the
chunks — both now keep the session for the next launch's recovery sweep.
Repair: a recording that won't play shows **Repair** — `wavRepair.ts` rebuilds the header from
the actual bytes (keeps every byte of audio, aligns the tail, wraps bare PCM), writes back only
if it changed, then retries with a fresh player (after a call the failure can be the iOS audio
session rather than the file). Not verified on a real iPhone call — test by recording, taking
a call, declining it, then Resume → Done.

## Why ScriptProcessorNode and not AudioWorklet
AudioWorklet is the modern replacement and avoids main-thread audio processing, but requires a
separate module script file loaded via `audioContext.audioWorklet.addModule(url)` — more
deploy/bundling surface for a PWA that's supposed to stay lightweight. Backgrounding already
fully stops capture immediately (`onBackgrounded`) rather than trying to keep recording while
hidden, so AudioWorklet's main real advantage here (robustness across tab throttling / background
threads) doesn't apply. ScriptProcessorNode is deprecated but still implemented everywhere this
app runs (iOS Safari, WKWebView) and needs zero extra build config.
