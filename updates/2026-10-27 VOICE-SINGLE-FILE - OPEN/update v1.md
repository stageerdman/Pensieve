# VOICE-SINGLE-FILE

## Goal
Phone voice recording must always produce exactly ONE playable audio file per take — never
"Part 1 of 2" split blocks, and never a corrupted first segment.

## Problem (found during VOICE-PLAYBACK-FIX follow-up)
The previous fix (VOICE-PLAYBACK-FIX, 2026-10-26) replaced MediaRecorder timeslice fragments
with 30s segment rotation (stop+restart MediaRecorder every 30s) because WebKit's mp4 output
can't be concatenated after the fact. That traded "unplayable" for "intentionally split into
multiple standalone blocks" — any take over 30s became several `pensieve:audio` blocks
("Part 1 of 2", etc.) in the same note. On top of that, Part 1 specifically has a real data
race in `stopCurrentSegment` (phone/src/lib/media/voiceCapture.ts, old lines 236-257): WebKit
can fire `onstop` before the final `dataavailable` for that segment lands, and by the time it
does arrive the recorder has already been swapped for segment 2 — the stale-recorder guard
silently drops it, leaving segment 0 empty/truncated and undecodable.

## Decision
Stop using `MediaRecorder` for phone voice capture entirely. Record raw PCM via the Web Audio
API (`ScriptProcessorNode`), stream it to IndexedDB chunk-by-chunk exactly like before (crash
safety preserved — a kill loses at most the last ~85ms callback), and finalize as ONE WAV file
by concatenating the raw PCM bytes behind a single 44-byte header. Raw PCM has no container
framing, so chunks genuinely concatenate byte-for-byte — no parts, no race, no WebKit mp4
quirks, because there is no mp4 anywhere in the pipeline anymore.

Trade-off accepted (confirmed with the owner): WAV is uncompressed, so files are bigger
(~1.9MB/min at 16kHz mono 16-bit, vs ~1MB/min for the old m4a). Resampled down to 16kHz on
capture (cheap linear-interpolation decimator) rather than recording at the native 44.1/48kHz
context rate, both to bound file size and because 16kHz is what the local Whisper models
already expect.

## Roadmap
1. **Pure PCM/WAV helpers** (`phone/src/lib/media/pcmWav.ts`) — resampler, float→int16,
   WAV header builder, unit tests. No DOM/MediaRecorder dependency, fully testable.
2. **Rewrite `voiceCapture.ts`** — drop MediaRecorder, SEGMENT_MS, segment
   rotation/opChain/rotateTimer entirely. New engine: one continuous `ScriptProcessorNode` on
   the mic stream for the whole session; pause/resume just gates writes (`capturing` flag) —
   no audio-graph teardown/rebuild needed since there's no decodability boundary to protect
   anymore. `finalizeAndCleanup` now always produces exactly one `pensieve:audio` block, no
   caption, built via `buildWavBlob`.
3. **`recordingStore.ts`** — add `sampleRate` to `RecordingSessionMeta` (replacing the
   MediaRecorder-mimeType-negotiation dance; session mimeType is now always `"audio/wav"`).
4. Verify desktop already handles `audio/wav` end to end (it does — AUDIO_MIME_EXT in
   `src/components/editor/media/insertAudio.ts` already maps `audio/wav` → `.wav`; Rust
   `transcribe.rs` has no format-specific logic, just hands the file path to the local Whisper
   engine).
5. Build + verify (phone dev server), update tests, commit + push, merge to main, deploy phone.

## Status
- Phase 1-4: done. `phone/src/lib/media/pcmWav.ts` (+ tests) built; `voiceCapture.ts` rewritten
  to drop MediaRecorder/segment-rotation entirely for a continuous ScriptProcessorNode → WAV
  pipeline; `recordingStore.ts` session meta carries `sampleRate`; legacy orphaned
  MediaRecorder-segment sessions from the pre-upgrade build are still finalized correctly
  (`finalizeLegacySegments`) instead of being silently corrupted.
- Phase 5: typecheck clean, full test suite green (1024 tests), `npm run build:phone` succeeds.
  Not yet device-verified (no way to exercise real mic capture from this environment — same
  caveat as VOICE-PLAYBACK-FIX). Merging to main + deploying phone next; owner should record a
  take on-device, including one that would have crossed the old 30s boundary, to confirm exactly
  one playable block appears.
