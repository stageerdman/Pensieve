# CRASH-SAFE-PROCESSING — update v1

## Goal
Processing a Journal batch (raw Memory → final Memories) must survive the app quitting,
crashing or being killed at ANY moment: nothing gets stuck, nothing is lost, nothing is
half-written, and every batch ends up done exactly once after a restart.

## What was wrong (root causes, from reading the code)
1. **Stuck forever.** `listUnprocessedRawBatches` only offers `synced` batches. A batch the
   app died on stays `processing` and is never offered again (the Journal batch cut off by
   the restart on 2026-11-22 is exactly this).
2. **Duplicates on rerun.** `processRawBatch` minted random note + media ids, so running a
   batch again after a crash made a second copy of every Memory it had already written.
3. **Half-written notes.** `store.create()` wrote an empty "Untitled" note *before* the AI
   work; a crash left it in the list. `write_text`/`write_bytes` wrote files in place, so a
   crash mid-write left a truncated `.md` / `.json`.
4. **No rollback.** Finishing deletes the raw record and its page photos; nothing kept a copy.
5. **No give-up.** A batch that always fails (or always crashes the app) was retried forever.
6. **Half-deleted raw.** `removeRawMemory` deleted the page photos before the record, so a
   crash in between left a record whose media is "missing" — held back by the queue forever.

## Design (one module: `src/lib/raw/job/`)
A **job record** `jobs/<rawId>.json` (local-only, never synced) is the batch's checkpoint:
`{ rawId, attempts, pages: {ref → AI description}, written?, setAside?, lastError? }`.

Run order for one batch (each step atomic, each logged as `raw/job.*`):
1. guard: already running in this app → refuse (no double run).
2. job: attempts += 1 (persisted *before* work, so a crash counts). attempts > 3 → set aside.
3. snapshot: copy `raw/<id>.json` + its page photos to `snapshots/raw/<id>/` (once).
4. status → `processing`.
5. describe pages — each AI answer saved into the job as it lands (resume skips them).
6. write outputs with **deterministic** ids (`<rawId>-<n>`, `media/<noteId>/p<k>.<ext>`):
   media copies → transcripts → the note `.md` last. Rerun = overwrite, never duplicate.
7. job.written = noteIds (the commit point) → remove raw record (record first, then
   photos) → remove the job.

On app start: every raw record left `processing` goes back to `synced` (the desktop's
"ready to process" state — `queued` means "still uploading from the phone" in this app)
and is offered again; its job records the interruption.

Rust `write_text` / `write_bytes` / new `copy_file` write to a temp file then rename.

## Phases
- [x] **P0 Roadmap** (this file).
- [x] **P1 Atomic writes** — Rust temp+rename for every vault write; Rust unit tests.
- [x] **P2 Deterministic, idempotent outputs** — processRawBatch split into describe +
      write; fixed ids; no early `create()`. Tests: rerun overwrites, never duplicates.
- [x] **P3 Job record + snapshot + runner** — attempts/set-aside, per-page checkpoint,
      snapshot + restore, single-run guard. Tests per rule.
- [x] **P4 Startup recovery + queue wiring** — `processing` → `synced` on start; set-aside
      rows shown with a clear error; Run on such a row releases it. Tests.
- [x] **P5 Kill tests** — (a) exhaustive: crash at *every* write step of a batch, restart,
      check exactly-once + no corruption; (b) real `SIGKILL` of a child process mid-batch
      at several points against a real temp folder, restart, same checks.
- [ ] **P6 Real vault** — only with a fresh verified backup; owner runs the rebuilt app.

## Live status
See bottom of `wiki.md` for decisions; status is the checkbox list above.
