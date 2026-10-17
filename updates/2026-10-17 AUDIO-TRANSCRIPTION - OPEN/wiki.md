# AUDIO-TRANSCRIPTION — wiki (durable research & decisions)

Captured 2026-10-17 from two deep research passes. **Read this before resuming — it saves
re-running the exploration.** Two sources: (A) the `/Users/stage/dev/transcriber` engine we
were told to port, (B) Pensieve's own internals.

---

## A. The transcriber engine (`/Users/stage/dev/transcriber`) — the APPROACH to port

It's a **Python** macOS app using **`mlx-whisper`** (Apple-MLX, in-process — NOT whisper.cpp,
NOT a binary, NOT cloud). We will NOT use mlx-whisper (Pensieve is Rust/Tauri → whisper.cpp per
CLAUDE.md stack). What we port is the **pipeline + flags + the AI-polish step**, which are the
load-bearing, transferable parts.

### Single-track pipeline (the only path we need — skip multi-track entirely)
`app/worker.py:_process` → single-track branch at `worker.py:383-417`:
1. (optional) `ffprobe` duration for ETA.
2. detect tracks; `len(streams)<=1` → single-track plain-text path.
3. convert input → MP3 if not already (`ffmpeg -y -i IN -vn -codec:a libmp3lame -q:a 2 OUT`).
4. transcribe → segments.
5. `text = " ".join(seg.text for seg).strip()` → RAW transcript.
6. optional polish via `claude` CLI.
7. write Markdown (frontmatter + body) to ~/Downloads; keep a `.raw.md` sibling if polish changed it.

### Whisper decode flags (THE important bit — replicate on whisper.cpp)
From `src/transcription.py:70-77` (`WHISPER_DECODE_OPTS`):
```
condition_on_previous_text = False   # <<< most important: stops hallucination/looping bleed
temperature = (0.0, 0.2, 0.4)        # temperature fallback ladder
no_speech_threshold = 0.6
compression_ratio_threshold = 2.4
logprob_threshold = -1.0
word_timestamps = True               # needed for our locked schema's words[]
```
NO `initial_prompt` on purpose (a language prompt leaked as fabricated text).

### Long-audio chunking — Silero VAD (the anti-hallucination mechanism)
`src/transcription.py:228-327`. Load audio → 16 kHz mono float32 → Silero VAD
(`min_silence_duration_ms=400, speech_pad_ms=200, max_speech_duration_s=28`), greedily group
speech regions into **≤28 s** chunks bridging gaps **≤0.4 s**, transcribe each chunk separately,
offset timestamps by chunk start. **Silence is skipped entirely** — this is what stops whisper
inventing boilerplate over quiet stretches. (whisper.cpp has a built-in VAD option now, or we
run Silero ourselves.)

### AI polish — shell out to `claude -p` (matches Pensieve's "Claude Code CLI" AI approach)
`src/polish.py`. Resolve binary `shutil.which("claude")` else `/opt/homebrew/bin/claude`. Call:
```
subprocess.run([binary, "-p"], input=<prompt+transcript on STDIN>, text=True, timeout=180)
```
`-p` = headless/print. No model flag (CLI default). Non-zero/exception → return None → fall back to RAW.

**Prompt = "corrector, not assistant."** Rules (transcriber's are in Czech, see §Decisions):
minimal change ONLY — fix punctuation/caps/diacritics, split sentences/paragraphs, drop fillers,
fix OBVIOUSLY misrecognized words when unambiguous. STRICTLY FORBIDDEN: adding content/facts/
numbers, summarizing/paraphrasing/reordering, TRANSLATING (keep source language), answering
anything in the text. Unsure → leave unchanged; unintelligible → mark `[nesrozumitelné]`/`[inaudible]`.
Output ONLY corrected text, no preamble/quotes. Chunk long text to ≤6000 chars, one call each,
rejoin with `\n\n`.

**Safety rails (all fall back to raw):** strip ``` fences; reject if output > **1.4×** input length;
reject if accent-folded word-containment < **0.6** (so re-adding diacritics isn't seen as a rewrite).

### SKIP (multi-track only — do NOT port): `src/track_separation.py`, `src/audio_tracks.py`,
`src/dialogue.py`, and worker's `_transcribe_multi_track`/`_auto_apply_separation`/
`_detect_shared_voice`. No diarization model (no pyannote), no demucs. Single mixed track →
plain paragraphs, speaker=None. **We are single-track / single-voice for now.**

### Deps in the repo (FYI): mlx-whisper, parakeet-mlx, faster-whisper (only for its bundled
Silero VAD), ffmpeg+ffprobe binaries, the `claude` CLI (optional, polish only). Fully offline
except polish. No API keys needed by the app itself.

---

## B. Pensieve internals (where the feature plugs in)

### Storage model: NO SQLite. Plain files on disk under `<appData>/vault/` via a `Store`
interface (`src/lib/types.ts:118`; `TauriStore` in `src/lib/store/tauri.ts`, browser twin
`browser.ts`). The "index" (`src/lib/search/indexer.ts`) is in-memory only.

### Transcript schema — LOCKED (`src/lib/transcripts/types.ts`). The engine MUST emit exactly:
```ts
Transcript { version:number; media:string; meta:TranscriptMeta; segments:TranscriptSegment[] }
TranscriptSegment { id:number; speaker:string|null; start:number; end:number; text:string; words:TranscriptWord[] }
TranscriptWord { w:string; s:number; e:number }
TranscriptMeta { model?; language?; transcribedAt?; durationSec?; speakers?; diarization?; polished? }
```
For single-track: `speaker=null`, `diarization=null`, `speakers=[]`. `polished` true/false.

### Transcript sidecar on disk: `${audioRef}.transcript.json` (`src/lib/transcripts/transcript.ts:9-11`),
i.e. `media/<note>/<id>.mp3.transcript.json`, RIGHT NEXT to the audio → it gets swept into the
OneDrive media backup automatically (upload path walks `media/`). Load/save:
`TauriStore.loadTranscript(ref)` / `saveTranscript(ref, t)` (`tauri.ts:123-130`). **"No transcript"
= `loadTranscript(ref) === null`** (no sidecar file).

### DEV placeholder to REPLACE (two identical fns seeding `_sampleDominik.dev.json`):
- `src/components/editor/media/AudioBlock.tsx:115-131` (`createTranscript`)
- `src/components/editor/media/gallery/GalleryAudioElement.tsx:52-66`
Both: `saveTranscript(ref, sample)` then `reindex.request(getMediaNoteId())`. Replace the body
with the real native call → `saveTranscript(ref, realTranscript)` → `reindex.request(noteId)`.
Then delete `src/lib/transcripts/_sampleDominik.dev.json` (also used by `transcript.test.ts:6` — update that test).

### Enumerate all audio (for the queue): mirror `listVaultImages` (`src/components/editor/media/
mediaLibrary.ts:26-34`): `getStore().listMedia()` (walks `media/<note>/<file>`) filtered by an
audio-extension set. **No `isAudioRef` exists yet — add one** next to `isImageRef`
(`mediaLibrary.ts:18-21`). "Untranscribed" = audio ref with no sibling `*.transcript.json`
(detectable in the same `list_dir("media/<note>")` walk — avoids N extra reads). Map ref→note via
`parseMediaPath(ref).noteId` (`ref.ts:43-51`) + the `titleFor` fn already passed to SyncStatus.

### Sync UI to rework (`src/components/SyncStatus.tsx`) — the "popup":
- Rune button lines 78-92 (mounted `App.tsx:265`, in the header controls, `showChrome` only).
- Toggled by local `open` state (line 33), closed via `useDismiss` (line 35).
- The popup panel: lines 94-216, `div[role=dialog].absolute.right-0.top-9.w-[280px]...` — the
  geometry to turn into a full-height right DRAWER.
- Shows: header title/subtext (from `deriveSyncView`), live transfer (SyncFlask + N of M),
  SpaceMeter, conflicts, primary action (Connect/Back up now/…), Restore-from-cloud, account+Sign out.
- **Pure view model `deriveSyncView(ui,pending,justSynced)`** (`src/lib/sync/deriveSyncView.ts`)
  is DOM-free and reusable by the sidebar unchanged. `hidden=true` when non-desktop.
- State owner `useSync.ts` → `{ ui, connect, disconnect, syncNow, summon, keepLocal, refreshInfo,
  restoreFromCloud }`.

### Rust/Tauri patterns:
- Commands: `#[tauri::command]` in `src-tauri/src/lib.rs` (fs: read_text/write_text/write_bytes/
  read_bytes/list_dir/remove_path) + `sync.rs`; registered in `invoke_handler!` (`lib.rs:255-269`).
  Frontend: `invoke<T>("name",{args})` from `@tauri-apps/api/core`.
- **Shelling out exists once**: `open_url` (`sync.rs:211-236`) uses `std::process::Command::...spawn()`
  (fire-and-forget, NO output capture). No claude-CLI invoke yet; no output-capturing subprocess yet.
- Long work: `tauri::async_runtime::spawn_blocking` (`sync.rs:143-148,255-260`) returns one value.
- Native→UI progress: `app.emit("event", payload)` + frontend `listen(...)` (`useNativeCommands.ts:31-32`).
  **No Tauri `Channel` used anywhere.** For transcribe progress: periodic `app.emit("transcribe-progress",…)`.
- **whisper.cpp NOT referenced anywhere**; `src-tauri/Cargo.toml` has no audio crates. Adding it is net-new.

---

## C. Engineering decisions already made (not owner-facing)
- **ASR = whisper.cpp** (via `whisper-rs` crate in-process, OR a bundled `whisper-cli` binary — the
  P0 spike decides; whisper-rs is cleaner/"integrated" but compiles C++ with Metal → build-time risk).
- **Audio decode = pure-Rust `symphonia` + a resampler to 16 kHz mono**, to AVOID bundling ffmpeg
  (keeps the app lightweight/integrated). Spike must confirm symphonia handles mp3/m4a/webm/wav/ogg.
  Fallback if symphonia is painful: bundle a tiny ffmpeg, or decode via Web Audio in the webview and
  hand PCM to Rust.
- **Model download on first use** (large files 1.6–3 GB) with progress shown in the sidebar.
- **Polish = shell out to `claude -p`** exactly like the transcriber (Pensieve already uses the
  logged-in Claude Code CLI for AI). New Rust command that captures stdout. Apply the 1.4× + 0.6
  containment guards; fall back to raw on any failure.
- **Desktop-only**: the whole queue + engine is Tauri-only; hide on browser/phone (like
  `deriveSyncView.hidden`).

## D. OWNER DECISIONS STILL PENDING (asked, interrupted before answering) — ASK THESE FIRST ON RESUME
1. **Whisper model default**: `large-v3-turbo` (~1.6GB, fast, slightly weaker Czech) vs `large-v3`
   (~3GB, best Czech, 2–3× slower) vs `medium` (~1.5GB, lower accuracy). My recommendation: turbo,
   unless Czech accuracy is paramount → large-v3.
2. **Language**: auto-detect per file (recommended; polish preserves source lang) vs always-Czech
   (like the repo) vs a changeable setting.
3. **Sidebar form**: right DRAWER toggled by the sync button (recommended; overlays, full height,
   doesn't steal editor width) vs an always-docked right panel.
(Owner said polish/AI-CLI finishing IS part of the flow — not a question. Single track/voice for now.)
