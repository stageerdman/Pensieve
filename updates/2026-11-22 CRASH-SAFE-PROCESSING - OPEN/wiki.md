# CRASH-SAFE-PROCESSING — wiki

## Where the code is
| Piece | File |
|---|---|
| Atomic write / copy (Rust, temp + fsync + rename) | `src-tauri/src/util.rs`, used by `write_text`, `write_bytes`, `copy_file` in `lib.rs` |
| The file seam the job needs | `src/lib/raw/job/vaultFiles.ts` (Tauri impl: `src/lib/store/tauriVaultFiles.ts`) |
| Deterministic outputs | `src/lib/raw/processRawBatch.ts` — `journalNoteId`, `journalPageRef`, `known`, `onPageDescribed` |
| Job record (checkpoint, tries, commit point) | `src/lib/raw/job/jobRecord.ts` |
| Snapshot / restore | `src/lib/raw/job/snapshot.ts` |
| The runner (the step order) | `src/lib/raw/job/runJournalJob.ts` |
| Startup recovery | `src/lib/raw/job/recover.ts`, called on mount in `useProcessQueue.ts` before the first scan |
| Queue: set-aside rows | `src/lib/raw/queue.ts` (`setAside`), `queueOps.ts` (`mergeNewJournalItems` → error row) |

## Decisions
- **Ready state is `synced`, not `queued`.** In this app `queued` means "the phone is still
  uploading", so a batch interrupted mid-processing goes back to `synced`.
- **A crash counts as a try.** `attempts` is saved before any work; after 3 the batch is set
  aside (untouched, still unprocessed) and shows as an error row with the last reason.
  Pressing Run on it releases it with 3 fresh tries; its saved AI page answers are kept.
- **Commit point = `job.written`.** Before it, a rerun resumes (reuses checkpointed AI
  answers, overwrites the same files). After it, only cleanup is left.
- **Record removed before photos.** A crash in between leaves orphan photos, which startup
  recovery now removes (the kill test found this gap).
- **Snapshots are kept after success**, so any batch can be rolled back (`restoreSnapshot`).
- **Double run** is refused within the app process (`JobAlreadyRunningError`).

## Tests
- `src/lib/raw/job/crash.test.ts`: the exhaustive in-memory kill. Two batches, 4 pages each,
  shared boundary page. The app is killed at **every** write of the run, and also killed twice
  in a row (the second time during recovery). Each run must end byte-identical to an
  uninterrupted run: no raw left behind, no orphan photos, snapshots intact, no job records.
- `src/lib/raw/job/killProcess.node.test.ts`: a **real child process** (bundled with esbuild)
  works on a real temp folder and is `SIGKILL`ed right after write #k, at 10 points across the
  run. A second process then finishes the job, with the same checks.
- `src/lib/raw/job/job.test.ts`: one test per rule. Snapshot first, resume from checkpoint,
  no double run, set aside after 3 (including 3 crashes), release on Run, recovery, restore.
- `src/lib/raw/processRawBatch.test.ts`: the new deps, fixed ids, rerun = overwrite,
  `known` skips the AI, note written last.
- Node-only test files end in `.node.ts` / `.node.test.ts`. They are excluded from the app's
  `tsc` and type-checked with `npm run typecheck:node-tests`.

## Risks / open
- **Rust not compiled or tested yet** (no `cargo` in the agent shell). Run `cargo test` in
  `src-tauri/` and rebuild the app before P6.
- **Snapshots grow** (one copy of every processed batch's photos). Pruning is a later decision.
- **Temp files** (`.<name>.tmp`) a crash leaves mid-write are harmless (ignored, overwritten
  next time) but are not swept.
- The double-run guard is per app process. Two app instances on one vault aren't guarded.
- **P6 real vault**: not touched. It needs a fresh verified backup, then the owner runs the
  rebuilt app on the Journal batch that was cut off.
