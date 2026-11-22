// block.ts — a NOTE SPELL: a Patronus block in a casual memory that carries a `state:` header
// (PATRONUS-BLOCK update). The phone writes `state: pending`; the Mac runs it once and writes
// `done` / `failed` back. A block WITHOUT a state line (every form template's block, every
// package's) is inert — that is the guarantee that nothing existing ever starts running.
//
// The memory is split around the block into `before` / `after` LINE arrays, so putting it back
// together with nothing changed is byte-identical (compose).
// Pure + dependency-free.

import { isAwaitingProcessing, isFormTemplate, withExtra, type Extra } from "../../forms";
import { PATRONUS_LANG, encodePatronus, findAllPatronus, type PatronusBlock, type PatronusHeaders } from "../../packages/patronus";
import { hashText } from "../../sync/notesIndex";
import { canonicalText } from "./canonical";

export type NoteSpellState = "pending" | "done" | "failed" | "undo" | "undone";

/** Frontmatter index hint the phone sets (`patronus: pending|undo`) so the Mac's scan reads
 *  only list() metadata. The block stays the truth; the hint is only a filter. */
export const PATRONUS_HINT_KEY = "patronus";

export interface NoteSpell {
  block: PatronusBlock;
  state: NoteSpellState;
  /** Lines of the memory above / below the block. */
  before: string[];
  after: string[];
}

type Parts = Pick<NoteSpell, "before" | "after">;

const STATES: NoteSpellState[] = ["pending", "done", "failed", "undo", "undone"];

const stateOf = (p: PatronusBlock): NoteSpellState | undefined => {
  const s = p.headers?.state as NoteSpellState;
  return STATES.includes(s) ? s : undefined;
};

/** A spell the Mac should act on. A blank pending spell (no words, no voice: a stray tap)
 *  asks nothing of it — the phone's computerWork() agrees. */
export function isActionable(p: PatronusBlock): boolean {
  const s = stateOf(p);
  if (s === "pending") return !!(p.instruction.trim() || p.headers?.voice?.trim());
  return s === "undo";
}

/** The memory's note spell: the first block the Mac should act on, else the first block with
 *  a known `state:`, else null. With `pick`, the first note spell `pick` accepts. A memory may
 *  hold several (the owner's "run again" is "add another block"). */
export function findNoteSpell(markdown: string, pick?: (block: PatronusBlock) => boolean): NoteSpell | null {
  const spells = findAllPatronus(markdown).filter((p) => stateOf(p));
  const found = pick ? spells.find(pick) : (spells.find(isActionable) ?? spells[0]);
  if (!found) return null;
  const lines = markdown.split("\n");
  const { start, end, ...block } = found;
  return { block, state: stateOf(block)!, before: lines.slice(0, start), after: lines.slice(end + 1) };
}

export function fenceLines(block: PatronusBlock): string[] {
  return ["```" + PATRONUS_LANG, ...encodePatronus(block).split("\n"), "```"];
}

/** The memory again, around (a possibly updated) block. Unchanged parts stay byte-identical. */
export function compose(spell: Parts, block: PatronusBlock): string {
  return [...spell.before, ...fenceLines(block), ...spell.after].join("\n");
}

/** Lines with every note-spell fence taken out (each with the blank line that parted it from
 *  the spell: the one below it when it sits above, the one above it when it sits below). */
function liftSpells(lines: string[], side: "above" | "below"): { text: string[]; fences: string[][] } {
  const drop = new Set<number>();
  const fences: string[][] = [];
  for (const f of findAllPatronus(lines.join("\n")).filter((p) => stateOf(p))) {
    fences.push(lines.slice(f.start, f.end + 1));
    for (let i = f.start; i <= f.end; i++) drop.add(i);
    const gap = side === "above" ? f.end + 1 : f.start - 1;
    if (lines[gap] !== undefined && !lines[gap].trim()) drop.add(gap);
  }
  return { text: lines.filter((_, i) => !drop.has(i)), fences };
}

/** The OTHER note spells of a memory, lifted out of its text: they are not Patronus's to read
 *  or change. `composeAround` puts them back, untouched, right next to the spell. */
export interface OtherSpells {
  above: string[][];
  below: string[][];
}

export function liftOtherSpells(spell: Parts): Parts & OtherSpells {
  const up = liftSpells(spell.before, "above");
  const down = liftSpells(spell.after, "below");
  return { before: up.text, after: down.text, above: up.fences, below: down.fences };
}

/** The memory from lifted parts: the text, the other spells stacked around this one. */
export function composeAround(parts: Parts, others: OtherSpells, block: PatronusBlock): string {
  const above = others.above.flatMap((f) => [...f, ""]);
  const below = others.below.flatMap((f) => ["", ...f]);
  return [...parts.before, ...above, ...fenceLines(block), ...below, ...parts.after].join("\n");
}

/** The memory's own text — everything but its note spells. What Patronus reads and may change. */
export function contentOf(spell: Parts): string {
  const { before, after } = liftOtherSpells(spell);
  return [...before, ...after].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function withHeaders(block: PatronusBlock, headers: PatronusHeaders): PatronusBlock {
  return { ...block, headers };
}

/** Only casual memories run: never a form template, never a form still waiting for its fill. */
export function isEligibleNote(extra: Extra): boolean {
  return !isFormTemplate(extra) && !isAwaitingProcessing(extra);
}

/** Does this memory have a note spell the Mac should act on now? */
export function isRunnableNoteSpell(note: { markdown: string; extra?: Extra }): boolean {
  const spell = findNoteSpell(note.markdown);
  return !!spell && isActionable(spell.block) && isEligibleNote(note.extra);
}

export function hasHint(extra: Extra): boolean {
  const v = extra?.[PATRONUS_HINT_KEY];
  return v === "pending" || v === "undo";
}

/** The hint to save with `markdown`: the work still waiting in it (a second spell), else none. */
export function hintFor(extra: Extra, markdown: string): Extra {
  const next = findAllPatronus(markdown).find(isActionable);
  return withExtra(extra, PATRONUS_HINT_KEY, next ? stateOf(next) : undefined);
}

/** Identity of ONE run: the same instruction, voice and run counter = the same run. Editing
 *  the instruction or bumping `run:` (Run again) makes a new one. */
export function runKey(noteId: string, block: PatronusBlock): string {
  const h = block.headers ?? {};
  return `${noteId}:${hashText([block.instruction, h.voice ?? "", h.run ?? "0"].join("\n"))}`;
}

/** Fingerprint of the memory's text, blind to how an editor re-saves lists (canonical.ts). */
export const contentHash = (spell: Parts): string => hashText(canonicalText(contentOf(spell)));
