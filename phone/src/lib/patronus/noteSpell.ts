// noteSpell.ts — the phone's side of a Patronus NOTE SPELL (PURE, no DOM).
//
// A note spell is a Patronus block in a casual memory with a `state:` header line. The phone
// writes the instruction and three transitions (arm, try again, undo); the computer casts it
// on sync and writes the result back (see updates/2026-11-22 PATRONUS-BLOCK).
// The block format is the ONE shared codec in src/lib/packages/patronus.ts and the state rules
// live in src/lib/patronus/noteSpell/block.ts — this module never parses fence text itself,
// so the two apps can't drift.
//
// Contract with the computer (agreed with the engine, 2026-11-22):
//   pending → (computer) done | failed;  done → (phone) undo → (computer) undone | done+error
//   failed → (phone) pending, `error:` dropped, `run:` kept. The phone never writes `running`.

import { encodePatronus, findAllPatronus, parsePatronus, type PatronusBlock } from "../../../../src/lib/packages/patronus";
// Type-only: block.ts pulls in desktop modules the phone bundle shouldn't carry.
import type { NoteSpellState } from "../../../../src/lib/patronus/noteSpell/block";

export type { NoteSpellState };

/** Same key as block.ts PATRONUS_HINT_KEY (a test pins them together). */
export const PATRONUS_HINT_KEY = "patronus";

const STATES: NoteSpellState[] = ["pending", "done", "failed", "undo", "undone"];
const ACTIONABLE: NoteSpellState[] = ["pending", "undo"];

const stateOf = (p: PatronusBlock): NoteSpellState | undefined =>
  STATES.includes(p.headers?.state as NoteSpellState) ? (p.headers!.state as NoteSpellState) : undefined;

/** A fresh, armed spell body (what the Patronus spell inserts). */
export function newSpellBody(instruction = ""): string {
  return encodePatronus({ spell: "sync", instruction, headers: { state: "pending" } });
}

/** Is this block body a note spell (has a known state line)? Blocks without one — forms,
 *  packages, legacy, pasted — are shown exactly as before and never edited here. */
export function isNoteSpell(body: string): boolean {
  return stateOf(parsePatronus(body)) !== undefined;
}

/** What the phone shows for a note spell. */
export interface SpellView {
  state: NoteSpellState;
  instruction: string;
  /** The words can still change (before it's cast, or to fix a fizzled one). */
  editable: boolean;
  /** One short status line under the incantation. */
  status: string;
  /** What the computer did (the one `did:` line), shown on a cast spell. */
  did?: string;
  /** The computer's reason for refusing an undo (`done` + `error:`). */
  undoNote?: string;
  /** The one action this state offers, if any. */
  action?: "undo" | "retry";
}

/** "22 Nov, 14:05" in the phone's locale, or "" for a missing/bad timestamp. */
export function fmtRan(iso: string | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

export function spellView(p: PatronusBlock): SpellView {
  const h = p.headers ?? {};
  const state = stateOf(p) ?? "pending";
  const did = h.did?.trim() || undefined;
  const base = { state, instruction: p.instruction, editable: false, ...(did ? { did } : {}) };
  const ran = fmtRan(h.ran);
  switch (state) {
    case "done": {
      const err = h.error?.trim();
      return { ...base, status: ran ? `Cast · ${ran}` : "Cast", ...(err ? { undoNote: err } : { action: "undo" as const }) };
    }
    case "failed": {
      const err = h.error?.trim();
      return { ...base, editable: true, status: err ? `Fizzled — ${err}` : "Fizzled", action: "retry" };
    }
    case "undo":
      return { ...base, status: "Undo waits for the computer" };
    case "undone":
      return { ...base, status: "Undone" };
    default:
      return { ...base, editable: true, status: "Waits for the computer" };
  }
}

/** The new instruction, keeping every header line as it was. */
export function withInstruction(p: PatronusBlock, instruction: string): PatronusBlock {
  return { ...p, instruction };
}

/** The owner changed the words. A fizzled spell whose words change is re-armed (failed →
 *  pending, like Try again): fixing a typo should be enough to make it run. */
export function editSpell(p: PatronusBlock, instruction: string): PatronusBlock {
  const next = withInstruction(p, instruction);
  return stateOf(p) === "failed" && instruction !== p.instruction ? retrySpell(next) : next;
}

/** How many memories hold a spell the computer still has to act on (for the after-sync nudge). */
export function spellsWaiting(bodies: Iterable<string | undefined>): number {
  let n = 0;
  for (const b of bodies) if (b && b.includes("pensieve:patronus") && computerWork(b)) n++;
  return n;
}

/** Try again: failed → pending; the error goes, the run counter stays. */
export function retrySpell(p: PatronusBlock): PatronusBlock {
  if (stateOf(p) !== "failed") return p;
  const { error: _error, ...rest } = p.headers ?? {};
  return { ...p, headers: { ...rest, state: "pending" } };
}

/** Undo: done → undo (the computer restores it on the next sync, if nothing changed since).
 *  A refused undo (`done` + `error:`) can't be asked again from the phone. */
export function requestUndo(p: PatronusBlock): PatronusBlock {
  if (stateOf(p) !== "done" || p.headers?.error) return p;
  return { ...p, headers: { ...p.headers, state: "undo" } };
}

/** The state the computer must act on in this body ("pending" first), or undefined. A blank
 *  pending spell (no words, no voice: a stray tap) asks nothing of it. */
export function computerWork(body: string): NoteSpellState | undefined {
  const states = findAllPatronus(body)
    .filter((p) => stateOf(p) !== "pending" || p.instruction.trim() || p.headers?.voice)
    .map(stateOf);
  return ACTIONABLE.find((s) => states.includes(s));
}

/** The frontmatter `extra` to save with `body`: `patronus: pending|undo` while a spell waits
 *  for the computer, dropped once none does. A memory that never had a spell keeps its `extra`
 *  exactly as it was (the same object — byte-identical on disk). */
export function withPatronusHint(extra: Record<string, string> | undefined, body: string): Record<string, string> | undefined {
  const want = body.includes("pensieve:patronus") ? computerWork(body) : undefined;
  const has = extra?.[PATRONUS_HINT_KEY];
  if (want) return has === want ? extra : { ...(extra ?? {}), [PATRONUS_HINT_KEY]: want };
  if (has === undefined) return extra;
  const { [PATRONUS_HINT_KEY]: _hint, ...rest } = extra!;
  return Object.keys(rest).length ? rest : undefined;
}
