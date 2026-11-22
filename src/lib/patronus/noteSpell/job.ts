// job.ts — the Process-queue job for one memory's note spell. Runs once, writes once:
//   pending → run the spell → ONE save with the result + `state: done` (or `failed` + error)
//   undo    → restore the `before-patronus` snapshot, only if the memory is still exactly as
//             the run left it; otherwise refuse with a message (never a blind overwrite).
// Conflict-safe: right before saving it syncs (refresh) and re-reads; if the owner changed
// the memory meanwhile, the result is thrown away and the block stays as the owner left it
// (still pending → runs again on the new text next sync). Never merges AI text into edits.
// Mac problems (Claude missing, transcriber broken) are rethrown: nothing written.

import type { Note, TimelineEntry } from "../../types";
import type { PatronusHeaders } from "../../packages/patronus";
import { log } from "../../logger";
import { compose, composeAround, contentHash, findNoteSpell, hintFor, isActionable, isEligibleNote, liftOtherSpells, runKey, withHeaders, type NoteSpell } from "./block";
import { NoteSpellFailure } from "./errors";
import type { RunLedger } from "./ledger";
import { runNoteSpell, type NoteSpellDeps } from "./run";

export interface NoteSpellJobDeps extends NoteSpellDeps {
  load(id: string): Promise<Note | null>;
  save(note: Note): Promise<void>;
  loadTimeline(id: string): Promise<TimelineEntry[]>;
  saveTimeline(id: string, entries: TimelineEntry[]): Promise<void>;
  ledger: RunLedger;
  /** Sync pull (and editor settle) right before the write, so the owner's latest edit wins. */
  refresh?(): Promise<void>;
  now?(): Date;
}

export type NoteSpellJobStatus = "done" | "failed" | "already-ran" | "discarded" | "undone" | "undo-refused" | "skipped";

export interface NoteSpellJobResult {
  status: NoteSpellJobStatus;
  /** The one-line reason for failed / undo-refused / skipped. */
  reason?: string;
}

const EDITED_SINCE = "You edited it since. Undo from Timeline on the computer.";

/** The headers every Mac write keeps from the owner's block. */
const ownerHeaders = (spell: NoteSpell): PatronusHeaders => {
  const { voice, run } = spell.block.headers ?? {};
  return { ...(voice !== undefined ? { voice } : {}), ...(run !== undefined ? { run } : {}) };
};

export async function runNoteSpellJob(noteId: string, deps: NoteSpellJobDeps): Promise<NoteSpellJobResult> {
  const note = await deps.load(noteId);
  const spell = note ? findNoteSpell(note.markdown) : null;
  if (!note || !spell || !isEligibleNote(note.extra)) return skipped(noteId, "no spell to run");
  if (!isActionable(spell.block)) return skipped(noteId, `spell is ${spell.state}`);
  return spell.state === "undo" ? runUndo(note, spell, deps) : runPending(note, spell, deps);
}

/** The receipt for a pending copy of a run that already applied (the phone's "keep mine"
 *  replaced the result). Fizzled, with `run:` bumped: Try again runs it on the owner's text. */
function alreadyRanBlock(spell: NoteSpell, ranAt: string) {
  const error = `Already ran on ${ranAt.slice(0, 10)}, but your phone's copy replaced the result (it's on the computer's Timeline). Try again runs it on this text.`;
  const run = String(Number(spell.block.headers?.run ?? 0) + 1);
  return withHeaders(spell.block, { state: "failed", ...ownerHeaders(spell), run, ran: ranAt, error });
}

function skipped(noteId: string, reason: string): NoteSpellJobResult {
  log.info("patronus-note", "job.skipped", { id: noteId, reason });
  return { status: "skipped", reason };
}

async function runPending(note: Note, spell: NoteSpell, deps: NoteSpellJobDeps): Promise<NoteSpellJobResult> {
  const key = runKey(note.id, spell.block);
  const ran = (deps.now?.() ?? new Date()).toISOString();
  const prior = await deps.ledger.get(key);
  if (prior?.status === "applied") {
    const md = compose(spell, alreadyRanBlock(spell, prior.ranAt));
    return written(await writeOnce(note, md, deps)) ? { status: "already-ran" } : discarded(note.id);
  }

  // The memory's other spells are not this run's: Patronus never sees them, they go back as is.
  const lifted = liftOtherSpells(spell);
  let result;
  try {
    result = await runNoteSpell({ id: note.id, title: note.title, spell: { ...spell, before: lifted.before, after: lifted.after } }, deps);
  } catch (e) {
    if (!(e instanceof NoteSpellFailure)) throw e;
    const md = compose(spell, withHeaders(spell.block, { state: "failed", ...ownerHeaders(spell), ran, error: e.message }));
    log.warn("patronus-note", "job.failed", { id: note.id, reason: e.message });
    return written(await writeOnce(note, md, deps)) ? { status: "failed", reason: e.message } : discarded(note.id);
  }

  const md = composeAround(result, lifted, withHeaders(spell.block, { state: "done", ...ownerHeaders(spell), ran, did: result.did }));
  const restoreTs = await writeOnce(note, md, deps, "before-patronus");
  if (!written(restoreTs)) return discarded(note.id);
  await deps.ledger.put(key, { status: "applied", ranAt: ran, afterHash: contentHash(result), restoreTs });
  log.info("patronus-note", "job.done", { id: note.id, removed: result.removed.length });
  return { status: "done" };
}

async function runUndo(note: Note, spell: NoteSpell, deps: NoteSpellJobDeps): Promise<NoteSpellJobResult> {
  const key = runKey(note.id, spell.block);
  const record = await deps.ledger.get(key);
  const snapshot = record?.status === "applied" ? (await deps.loadTimeline(note.id)).find((e) => e.label === "before-patronus" && e.ts === record.restoreTs) : undefined;
  const restored = snapshot?.markdown !== undefined ? findNoteSpell(snapshot.markdown, (b) => runKey(note.id, b) === key) : null;

  if (!record || !restored || record.afterHash !== contentHash(spell)) {
    const reason = record?.status === "undone" ? "Already undone." : EDITED_SINCE;
    const md = compose(spell, withHeaders(spell.block, { ...spell.block.headers, state: "done", error: reason }));
    log.info("patronus-note", "undo.refused", { id: note.id, known: !!record, snapshot: !!restored });
    return written(await writeOnce(note, md, deps)) ? { status: "undo-refused", reason } : discarded(note.id);
  }

  // The text as it was before the run; the memory's other spells as they are NOW (a spell
  // added since the run must survive its neighbour's undo).
  const md = composeAround(liftOtherSpells(restored), liftOtherSpells(spell), withHeaders(restored.block, { state: "undone", ...ownerHeaders(spell) }));
  if (!written(await writeOnce(note, md, deps, "before-undo"))) return discarded(note.id);
  await deps.ledger.put(key, { ...record, status: "undone" });
  log.info("patronus-note", "undo.done", { id: note.id });
  return { status: "undone" };
}

function discarded(noteId: string): NoteSpellJobResult {
  log.info("patronus-note", "job.discarded", { id: noteId });
  return { status: "discarded" };
}

/** The single write of a run. Re-reads the memory after a sync: if it changed since `start`,
 *  nothing is written (returns null). With `label`, the memory as it was is kept on the
 *  Timeline first; returns that entry's ts (else 0). */
async function writeOnce(start: Note, markdown: string, deps: NoteSpellJobDeps, label?: TimelineEntry["label"]): Promise<number | null> {
  await deps.refresh?.();
  const latest = await deps.load(start.id);
  if (!latest || latest.markdown !== start.markdown) return null;
  let ts = 0;
  if (label) {
    ts = (deps.now?.() ?? new Date()).getTime() - 1;
    const entries = await deps.loadTimeline(start.id);
    await deps.saveTimeline(start.id, [...entries, { ts, wordDelta: 0, markdown: latest.markdown, label }]);
  }
  await deps.save({ ...latest, markdown, extra: hintFor(latest.extra, markdown) });
  return ts;
}

const written = (ts: number | null): ts is number => ts !== null;
