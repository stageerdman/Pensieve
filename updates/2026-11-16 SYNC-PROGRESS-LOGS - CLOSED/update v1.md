# SYNC-PROGRESS-LOGS — update v1

**Goal.** Owner saw "3412 of 3412" yet the panel kept saying "Backing up…", and couldn't
tell where 3412 came from (expected ~2000). Make "done" mean done, and make counts explainable.

## Findings (2026-11-16)
- The headline count is **notes transferred this run (downloads + uploads)**, not items owned.
- Media (photos/audio/video) ran AFTER the notes with **no progress at all** — at the time,
  81 files / 0.65 GB pending incl. a 435 MB .mov, actively uploading.
- Logs were in-memory only → the 3412 split couldn't be confirmed after the fact.

## Phases
1. ✅ Media gets its own progress stage (`SyncProgress.stage`), panel shows "Media · N of M";
   `sync.plan` log records downloads/uploads/new/delta-fresh per run. Tests added.
2. ✅ Persisted logs: logger sink → Rust `append_log` → `~/Library/Logs/xyz.erdman.pensieve/ui.jsonl`
   (5 MB cap, 1 rotation). `npm run logs -- --module sync --event plan --since 2h`.

## Status
Merged to main, native app built + installed. Owner check: next backup shows media count;
`npm run logs -- --event sync.plan` explains the next headline count.
