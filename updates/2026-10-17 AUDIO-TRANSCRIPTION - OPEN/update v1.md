# AUDIO-TRANSCRIPTION — update v1

## Goal
Local, on-computer audio transcription for Pensieve. Every logged audio (loaded via sync OR
from the computer) that has **no transcript yet** shows up in a queue; one click **Transcribe**
runs the engine, saves the transcript sidecar, it uploads with sync, and the row disappears.
The sync **popup becomes a side bar**: current sync info on top, the untranscribed-audio queue
below. Transcription is **desktop-only**, single-track / single-voice (no diarization) for now.

Engine = port the `/Users/stage/dev/transcriber` **approach** onto **whisper.cpp** (Pensieve is
Rust/Tauri) + the **`claude -p` AI polish** step. Full engine/flags/prompt detail + Pensieve
plug-in points are in **`wiki.md` — READ IT FIRST.**

## ▶ RESUME HERE (next session) — updated 2026-10-17 (WRAP-UP, nothing coded yet)
**Branch:** `update/audio-recordings` (transcription will continue here or a branch off it;
AUDIO-RECORDINGS is NOT merged to main yet — see that update's resume block + its P7/device-verify).
**HEAD = `cbbee3e` (P6.7), tree clean, pushed.** NO transcription code written yet — this update
is **research + plan only** so far. 845+4 tests green as of P6.7.

### FIRST THING ON RESUME: get the 3 owner decisions (asked, but interrupted before answering)
They are in `wiki.md` §D. Summary: (1) whisper model default — turbo vs large-v3 vs medium;
(2) language — auto-detect vs always-Czech vs a setting; (3) sidebar — right drawer (toggled by
sync button) vs always-docked panel. My recommendations: turbo (or large-v3 if Czech accuracy
matters most), auto-detect, right drawer. Then bake answers into the phases below and build.

### THEN: Phase 0 is a RESEARCH SPIKE (biggest risk) — do it before committing to the plan
Verify, in a throwaway spike **inside this update folder** (not main code):
- whisper.cpp integration: `whisper-rs` crate compiling in the shared Cargo target WITH Metal on
  this Mac, loading a small ggml model, transcribing a 16 kHz mono wav → text. (Fallback: bundle a
  `whisper-cli` binary and shell out + capture stdout — we have the spawn pattern but not capture.)
- audio decode without ffmpeg: `symphonia` decoding mp3/m4a/webm/ogg/wav → PCM + resample to
  16 kHz mono. (Fallback: Web Audio decode in the webview → hand Float32 PCM to Rust.)
- confirm `claude -p` on stdin works headless from a Rust `Command` with captured stdout.
Record results in `wiki.md` (§C) and pick the integration path. ONLY whisper build + decode are
risky; the rest is wiring.

## Phased roadmap (refine after decisions + spike)
- **P0 — Spike** (above): prove whisper.cpp + symphonia + `claude -p` from Rust. Pick the path.
- **P1 — Queue data layer (TS, no UI):** `isAudioRef` + an `listUntranscribedAudio()` that walks
  `listMedia()`, filters audio exts, drops any ref with a sibling `*.transcript.json`, maps ref→note
  title. Pure + tested. (wiki §B "Enumerate all audio".)
- **P2 — Sync popup → sidebar drawer:** rework `SyncStatus.tsx` into a full-height right drawer
  (reuse `deriveSyncView` verbatim) with a new **Transcribe queue** section below the sync info —
  one row per untranscribed audio (note title + duration) + a **Transcribe** button + per-row
  progress/err state. Launch UX agents (per CLAUDE.md) for the drawer + queue layout; synthesize.
  Hidden on non-desktop.
- **P3 — Native engine (Rust):** new Tauri command `transcribe_audio(ref, opts)` →
  decode (symphonia) → 16 kHz mono → Silero VAD ≤28 s chunks (skip silence) → whisper.cpp with the
  wiki flags (`condition_on_previous_text=false`, temp ladder, no initial prompt, word_timestamps)
  → assemble the LOCKED `Transcript` schema (speaker=null). Model auto-download + progress via
  `app.emit("transcribe-progress",…)`. First: add whisper-rs/model-mgmt to `Cargo.toml`.
- **P4 — AI polish (Rust):** after the raw transcript, shell `claude -p` (stdin = corrector prompt
  + text, chunked ≤6000 chars) with the 1.4× length + 0.6 containment guards; fall back to raw on
  any failure. Set `meta.polished`. Language per the decision (preserve source language).
- **P5 — Wire end-to-end:** Transcribe button → P3+P4 → `saveTranscript(ref, t)` →
  `reindex.request(noteId)` → trigger a sync push (upload sidecar) → remove the row. Replace BOTH
  DEV `createTranscript` seeders (AudioBlock + GalleryAudioElement) with the real call; delete
  `_sampleDominik.dev.json` + fix `transcript.test.ts`. Progress + error UX in the row.
- **P6 — Build, device-verify (real mic recording → transcribe → read in split), merge.**

## Status / decisions / next
- 2026-10-17: Deep research done (transcriber engine + Pensieve internals) → `wiki.md`. Plan drafted.
  Asked the 3 owner decisions; **interrupted before answers** → they're the first thing on resume.
  No code yet. Everything still on `update/audio-recordings` @ `cbbee3e`.
- Open question beyond the 3: whether a failed/aborted transcribe leaves a retry affordance in the
  queue (assume yes), and model-download UX (assume: first-use download w/ progress, one-time).
