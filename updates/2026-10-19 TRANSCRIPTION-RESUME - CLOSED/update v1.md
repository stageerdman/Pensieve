# TRANSCRIPTION-RESUME

## Goal
Make transcription **stoppable and restorable**. If a job is interrupted — app quit, crash, a
mid-run error (e.g. the exit-120 teardown bug), or a sleep that broke the run — reopening Pensieve
**resumes the unfinished work automatically, mid-file** (continuing from the last checkpoint, not
from zero). A long Czech job (~2 h on a 75-min tape) must survive interruption.

Owner decisions (2026-10-19):
- **Resume depth: mid-file checkpoint.** The engine saves progress per chunk; on reopen it continues
  from the last completed chunk. (True mid-file applies to **czech-whisper**, which processes VAD
  chunks sequentially. **parakeet** is a single-shot library call — fast (~3 min), so it restarts the
  whole file on resume; no checkpoint.)
- **Auto-resume: automatically.** Reopening picks up where it left off with no user action.
- **Stop = responsive Pause.** Pausing now actually cancels the running subprocess (keeping its
  checkpoint) instead of waiting for a 2-hour job to finish; Run resumes from the checkpoint.

## Design
- **Checkpoint sidecar (engine-owned).** While transcribing czech-whisper, the engine writes a partial
  JSON checkpoint after each VAD chunk: the deterministic chunk plan, `nextChunk`, and accumulated
  segments. On start it loads a matching checkpoint (same audio+model+chunk plan) and resumes from
  `nextChunk`; on full completion it deletes the checkpoint. Checkpoints live in
  `<appData>/transcription/` (NOT the vault media dir) so they never pollute the note vault or OneDrive sync.
- **Rust: checkpoint path + cancellable child.** Rust resolves the checkpoint path and passes
  `--checkpoint`; it registers each running child in shared state so a new `cancel_transcription`
  command can kill it. A cancelled run returns a distinct sentinel (not an error).
- **Frontend: Pause cancels + Run resumes.** The global Pause cancels the active job (checkpoint kept,
  progress frozen); Run resumes. A cancelled job is NOT marked as error.
- **Frontend: queue persistence + auto-resume.** Persist per-ref {model, order} + {playing, mode} via a
  store seam (file in native, localStorage in browser). On mount: rebuild from the vault scan, restore
  model/order and the playing flag → auto-resume. Partial-checkpoint files keep an interrupted item in
  the "untranscribed" set, so it reappears in the queue on its own; persisted `playing` makes it run.

## Phased roadmap
- **Phase 1 — Engine checkpointing (czech-whisper).** Deterministic chunk plan; write/read/delete
  checkpoint; resume from nextChunk; emit resumed progress. CLI spike: interrupt a run, re-run, confirm
  it resumes and the final transcript matches an uninterrupted run. — STATUS: ✅ DONE (CLI spike:
  killed after chunk 5/15 → resumed to identical result; checkpoint auto-deleted on success).
- **Phase 2 — Rust checkpoint path + cancellable child.** Resolve+pass `--checkpoint`; child registry;
  `cancel_transcription`; cancelled-sentinel. — STATUS: ✅ DONE (cargo check clean; command registered).
- **Phase 3 — Frontend Stop + mid-file Pause.** Pause cancels the active job; Run resumes; cancelled
  ≠ error. — STATUS: ✅ DONE (engine.cancel + isCancelled seam; tsc + tests green).
- **Phase 4 — Frontend queue persistence + auto-resume.** Store seam; restore on mount; auto-run.
  — STATUS: ✅ DONE (localStorage `pensieve:transcription:queue`; hook owns init + auto-resume).
- **Phase 5 — Tests + native build + verify.** Unit tests (checkpoint I/O, persistence merge, cancel
  path); build the .app; verify an interrupted Czech job resumes on reopen. — STATUS: ✅ built + unit-
  tested (897 green); native app installed 10:06. Live GUI cycle awaits owner device-confirmation
  (can't drive the WKWebView from here).

## Live status — CLOSED 2026-10-19 (owner-confirmed: "works great, exactly as I wanted")
- All phases shipped to main; native app confirmed on device. Folder CLOSED.
- Post-build: the recurring "engine exited with status 120" was run to ground by a 3-agent debug
  team and fixed — it was a RUST panic in transcribe.rs's stderr reader (`String.split_off` off a
  UTF-8 char boundary on tqdm's `█` bytes), which closed the child's stderr pipe and manufactured
  the 120; NOT an engine fault. Fix: byte-safe bounded line buffer (push_bounded, +regression
  tests), verbose=None to kill the tqdm flood, _safe_stderr guards, on-disk --debug-log,
  code-vs-signal reporting, env hardening + caffeinate. See wiki.md "The real exit 120 root cause".
- **Owner to confirm on the native app:** start a long Czech transcription, quit mid-run, reopen →
  it should reappear and continue from where it left off; Pause should stop promptly and Run resume.
- Known accepted edge: the queue mounts inside SyncStatus, which is hidden only when OneDrive is
  "unavailable"; the connected owner always mounts it, so auto-resume fires on launch. If sync is ever
  fully unavailable, auto-resume waits until a surface mounts the queue — acceptable for single-user.
- Folder stays OPEN until owner device-confirmation; then rename to CLOSED.
