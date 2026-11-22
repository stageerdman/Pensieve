// noteSpell.ts — the phone's side of a Patronus NOTE SPELL (PURE, no DOM).
//
// A note spell is a Patronus block in a casual memory with an explicit `state:` line. The
// phone writes the instruction and three transitions (arm, try again, undo); the computer
// casts it on sync and writes the result back (see updates/2026-11-22 PATRONUS-BLOCK).
// The block format itself is the ONE shared codec in src/lib/packages/patronus.ts — this
// module never parses fence text on its own, so the two apps can't drift.

import {
  encodePatronus,
  findAllPatronus,
  parsePatronus,
  type NoteSpellState,
  type PatronusBlock,
} from "../../../../src/lib/packages/patronus";

/** The frontmatter key the computer's scan reads to find memories with work to do. It is
 *  only a filter (the block is the truth), derived from the body on every save. */
export const PATRONUS_HINT_KEY = "patronus";
export const PATRONUS_HINT_PENDING = "pending";

/** A fresh, armed spell body (what the Patronus spell inserts). */
export function newSpellBody(instruction = ""): string {
  return encodePatronus({ spell: "sync", state: "pending", instruction });
}

/** Is this block body a note spell (has a state line)? Blocks without one — forms,
 *  packages, legacy, pasted — are shown exactly as before and never edited here. */
export function isNoteSpell(body: string): boolean {
  return parsePatronus(body).state !== undefined;
}

/** What the phone shows for a note spell. */
export interface SpellView {
  state: NoteSpellState;
  instruction: string;
  /** The words can still change (before it's cast, or to fix a fizzled one). */
  editable: boolean;
  /** One short status line under the incantation. */
  status: string;
  /** What the computer did (`did:` lines), shown on a cast spell. */
  did: string[];
  /** Media the computer moved to Trash (refs), shown as "Moved to Trash: …". */
  removed: string[];
  /** The computer's note on an undo request it refused. */
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
  const state = p.state ?? "pending";
  const base = { state, instruction: p.instruction, did: p.did ?? [], removed: p.removed ?? [], editable: false };
  switch (state) {
    case "done": {
      const ran = fmtRan(p.ran);
      return {
        ...base,
        status: ran ? `Cast · ${ran}` : "Cast",
        ...(p.undo ? { undoNote: p.undo } : { action: "undo" as const }),
      };
    }
    case "failed":
      return { ...base, editable: true, status: p.error ? `Fizzled — ${p.error}` : "Fizzled", action: "retry" };
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

/** Try again: failed → pending; the error goes, the run counter stays. */
export function retrySpell(p: PatronusBlock): PatronusBlock {
  if (p.state !== "failed") return p;
  const { error: _error, ...rest } = p;
  return { ...rest, state: "pending" };
}

/** Undo: done → undo (the computer restores it on the next sync, if nothing changed since). */
export function requestUndo(p: PatronusBlock): PatronusBlock {
  if (p.state !== "done" || p.undo) return p;
  return { ...p, state: "undo" };
}

/** Does this body hold a spell the computer still has to act on? */
export function needsComputer(body: string): boolean {
  return findAllPatronus(body).some((p) => p.state === "pending" || p.state === "undo");
}

/** The frontmatter `extra` to save with `body`: the hint is set while a spell waits for the
 *  computer and dropped once none does. A memory that never had a spell keeps its `extra`
 *  exactly as it was (the same object — byte-identical on disk). */
export function withPatronusHint(extra: Record<string, string> | undefined, body: string): Record<string, string> | undefined {
  const wants = needsComputer(body);
  const has = extra?.[PATRONUS_HINT_KEY] !== undefined;
  if (wants) return extra?.[PATRONUS_HINT_KEY] === PATRONUS_HINT_PENDING ? extra : { ...(extra ?? {}), [PATRONUS_HINT_KEY]: PATRONUS_HINT_PENDING };
  if (!has) return extra;
  const { [PATRONUS_HINT_KEY]: _hint, ...rest } = extra!;
  return Object.keys(rest).length ? rest : undefined;
}
