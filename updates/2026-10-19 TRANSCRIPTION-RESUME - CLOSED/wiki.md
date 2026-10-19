# TRANSCRIPTION-RESUME — wiki

Durable decisions & lessons.

## Checkpointing (Phase 1, proven)
- czech-whisper transcribes **deterministic** Silero-VAD chunks in order, so resume is just
  "skip the chunks already in the checkpoint". Verified: kill after chunk 5/15 → resume jumps the
  progress bar to ~35% and continues → final transcript is **byte-identical** to an uninterrupted run.
- Checkpoint = `{version, model, language, plan:[[s,e]…], nextChunk, segments}`. Trusted only when
  `model`+`language`+`plan` match the recomputed plan (guards against a changed file/model/params).
- Write is **atomic** (`write tmp` + `os.replace`) so a crash mid-write can't corrupt it. Save after
  every chunk; delete only once the FULL transcript (incl. polish) is assembled — so a death during
  the polish step resumes cheaply (all chunks already done → 0 re-transcription, just re-polish).
- **parakeet** is a single library `.transcribe()` call → no per-chunk seam → no checkpoint. It's
  ~3 min for a 75-min tape, so it restarts whole on resume. Acceptable.
- Checkpoints live in `<appData>/transcription/` (passed via `--checkpoint`), NOT the vault media
  dir — keeps them out of the note vault + OneDrive sync.

## The real "exit 120" root cause (proven by a 3-agent debugging team, 2026-10-19)
- The recurring "engine exited with status 120" was NOT a Python/engine fault at all. It was a
  **Rust panic** in `transcribe.rs`'s stderr-tail ring buffer: `tail.split_off(tail.len() - 2000)`
  panics when that byte offset isn't a UTF-8 char boundary — which mlx_whisper's tqdm progress
  bars (3-byte `█`) routinely cause. The panic (unwind, thread-only, app survives) dropped
  `ChildStderr` → closed the child's stderr pipe → the engine's next stderr write raised
  `BrokenPipeError` → it cascaded through the handler (whose OWN stderr write re-broke) → CPython
  finalized with **exit 120 and empty stdout**. That's why `os._exit`, the `ENGINE ERROR` guard,
  "trust non-empty stdout", and per-chunk retry were ALL bypassed, and why the error popover tail
  was empty (just "120"). The CLI never failed because a TTY stderr has no Rust `lines()/split_off`
  reader to panic.
- Reproduced end-to-end: a faithful Rust harness mimicking `transcribe.rs` I/O, driving the real
  engine on the real 75-min file from the checkpoint → `is_char_boundary` panic → exit 120, empty
  tail. And `os._exit` was proven innocent (always returns rc, even with daemon threads mid-write).
- Lessons: (1) NEVER byte-slice a `String` at a computed offset — bound by whole lines / char
  boundaries. (2) A child's stderr reader dying silently can manufacture a bogus child exit code;
  read bytes + lossy-decode and never panic in that thread. (3) An engine must treat its own
  stderr as a pipe that can break — guard every write. (4) `verbose=None` (not False) disables
  mlx_whisper's tqdm bar, removing the multi-byte flood at the source.
- Secondary (env agent): a ~2 h job runs as a dockless `Accessory` process with no power
  assertion → App Nap / idle sleep can invalidate the Metal context mid-run. Mitigated with
  `caffeinate -i -w <child>` for the job's lifetime. (fd limit 256 noted, not yet raised.)
