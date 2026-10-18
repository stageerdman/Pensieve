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

## ⚑ BEHAVIORAL SPEC — owner, 2026-10-18 (governs the real build)
The queue + engine must obey these rules (prototype proved the UI; this is the behaviour):
1. **Auto by default.** Every recording that is **synced in** and has **no transcript** is added to
   the queue and transcribed automatically, using the **Czech** model by default (no prompt).
2. **Locally-added ≠ auto.** A recording added **directly in a note** (local, not via sync) does
   **not** auto-transcribe. It transcribes when I **click Process** manually, **or on the next sync**.
   → So **sync is the enqueue trigger**: pressing Sync scans for new untranscribed recordings, adds
   them, and transcribes them (Czech default).
3. **Sync is primary, transcription secondary, they run in PARALLEL.** Always sync first; transcription
   runs alongside at lower priority. Uploading an mp3 → it syncs **and** transcribes at the same time.
4. **Finished transcript → sync it.** When a transcription completes, its sidecar is **auto-synced**
   after it finishes (preferred), **or** the drawer offers a one-tap "sync again" when done.
5. **Model change resets progress** — switching a row's model restarts it from 0 (already in prototype).

### P0 SPIKE RESULT — 2026-10-18: environment is GO on this Mac ✅
Apple M3/arm64 (Metal). Transcriber `.venv` (py3.11) imports `mlx_whisper` + `parakeet_mlx`.
`ffmpeg`/`ffprobe`/`claude` present. BOTH models already in HF cache (`mikr/whisper-large-v3-czech-cv13`,
`mlx-community/parakeet-tdt-0.6b-v3`) — no 6 GB download. **Packaging decision (for now, single-user
owner):** Pensieve shells out to a ported Python engine run by the transcriber's venv (path
configurable); bundling a self-contained venv into the distributable `.app` is deferred to a later
packaging pass. Engine emits the LOCKED `Transcript` schema on stdout; Rust captures it + emits progress.

## ▶ RESUME HERE (next session) — updated 2026-10-18 (P1 core built + UI prototype; AWAITING owner A/B/C pick)
**Branch:** `update/audio-transcription` (off `main`; AUDIO-RECORDINGS now MERGED to main & shipped).
Tree clean, pushed. Model question SETTLED (owner directive "same models as /dev/transcriber" →
see `wiki.md` ⚑ DECISION UPDATE 2026-10-18): **Czech-Whisper default + Parakeet "simple English";
engine = shell out to a Python/MLX subprocess, NOT whisper.cpp.**

### DONE this session
- **P1 core (TS, model-agnostic, tested):** `src/lib/transcripts/` —
  `audioRef.ts` (isAudioRef + sidecar predicates), `queue.ts` (`listUntranscribedAudio`, store-
  agnostic, pure `partitionAudioRefs`), `models.ts` (two-model catalog: ids/backendIds/labels/
  hints/choice order/`coerceModel`), `engine.ts` (`TranscriptionEngine` seam + progress phases),
  `rowStatus.ts` (phase→status mapping). +18 tests. `tsc` clean.
- **UI PROTOTYPE:** `prototypes/transcription-ui.html` (single self-contained file + shared
  `_kit.css`). Live-combinable **A**(drawer) × **B**(row) × **C**(choice) with a real transcribe
  lifecycle sim. Built from 3 parallel UX agents; jsdom smoke-tested.

### ⛔ NEXT: owner picks the combo (A#, B#, C#) — recommendations A2 · B2 · C2
Variants (full rationale in each agent's proposal / the prototype rail legend):
- Drawer: A1 calm-column · **A2 whisper-sync/queue-first (rec)** · A3 push-content
- Row:    B1 one-line · **B2 two-line + mini-waveform (rec)** · B3 progressive-expand
- Choice: C1 popover · **C2 split-button (press=Czech / ▾=choose) (rec)** · C3 inline reveal
Then: P2 build the chosen drawer+queue as real React (wire `listUntranscribedAudio` + the model
catalog into `SyncStatus`→drawer), then P0 packaging spike (bundle the Python/MLX engine) → P3+ engine.

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
