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

export type NoteSpellState = "pending" | "done" | "failed" | "undo" | "undone";
/** The states the Mac acts on. */
const ACTIONABLE: NoteSpellState[] = ["pending", "undo"];

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

const STATES: NoteSpellState[] = ["pending", "done", "failed", "undo", "undone"];

/** The memory's note spell: its first Patronus block that has a known `state:`, or null. */
export function findNoteSpell(markdown: string): NoteSpell | null {
  const found = findAllPatronus(markdown).find((p) => STATES.includes(p.headers?.state as NoteSpellState));
  if (!found) return null;
  const lines = markdown.split("\n");
  const { start, end, ...block } = found;
  return { block, state: block.headers!.state as NoteSpellState, before: lines.slice(0, start), after: lines.slice(end + 1) };
}

export function fenceLines(block: PatronusBlock): string[] {
  return ["```" + PATRONUS_LANG, ...encodePatronus(block).split("\n"), "```"];
}

/** The memory again, around (a possibly updated) block. Unchanged parts stay byte-identical. */
export function compose(spell: Pick<NoteSpell, "before" | "after">, block: PatronusBlock): string {
  return [...spell.before, ...fenceLines(block), ...spell.after].join("\n");
}

/** The memory's own text — everything but the block. What Patronus reads and may change. */
export function contentOf(spell: Pick<NoteSpell, "before" | "after">): string {
  return [...spell.before, ...spell.after].join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
  return !!spell && ACTIONABLE.includes(spell.state) && isEligibleNote(note.extra);
}

export function hasHint(extra: Extra): boolean {
  const v = extra?.[PATRONUS_HINT_KEY];
  return v === "pending" || v === "undo";
}

export const clearHint = (extra: Extra): Extra => withExtra(extra, PATRONUS_HINT_KEY, undefined);

/** Identity of ONE run: the same instruction, voice and run counter = the same run. Editing
 *  the instruction or bumping `run:` (Run again) makes a new one. */
export function runKey(noteId: string, block: PatronusBlock): string {
  const h = block.headers ?? {};
  return `${noteId}:${hashText([block.instruction, h.voice ?? "", h.run ?? "0"].join("\n"))}`;
}

export const contentHash = (spell: Pick<NoteSpell, "before" | "after">): string => hashText(contentOf(spell));
