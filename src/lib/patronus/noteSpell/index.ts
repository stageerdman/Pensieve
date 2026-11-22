// Note spells (PATRONUS-BLOCK): a Patronus block in a casual memory that the Mac runs once on
// sync. See updates/2026-11-22 PATRONUS-BLOCK - OPEN/update v1.md.
export { findNoteSpell, isRunnableNoteSpell, PATRONUS_HINT_KEY, type NoteSpell, type NoteSpellState } from "./block";
export { NoteSpellFailure } from "./errors";
export { storageLedger, type RunLedger, type RunRecord } from "./ledger";
export { runNoteSpell, type NoteSpellDeps, type NoteSpellResult } from "./run";
export { runNoteSpellJob, type NoteSpellJobDeps, type NoteSpellJobResult, type NoteSpellJobStatus } from "./job";
export { listNoteSpellsToRun, type NoteSpellQueueItem, type NoteSpellQueueStore } from "./queue";
