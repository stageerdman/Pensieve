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
