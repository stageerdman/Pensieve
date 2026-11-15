// patronus.ts — the Patronus block: the last block of every PACKAGE (a sealed raw memory the
// desktop AI resolves on sync). It carries the package's SPELL — the instruction Patronus
// reads and executes when the package arrives. Stored as a `pensieve:*` fence like every
// other Pensieve block:
//
//   ```pensieve:patronus
//   spell: sync
//   Transcribe the recording and fill in the form from it.
//   ```
//
// `spell` names WHICH spell this Patronus casts; the rest of the fence is the instruction,
// verbatim. One block, one Patronus (AI) — the spell is what it's for:
//   - `sync`     "Process on sync": runs by itself when a phone walk-through reaches the
//                computer. A form's sync block overrides the default instruction for
//                packages made from that form; every package ends in one.
//   - `compress` "Compress": lives only in a form; memories made from the form show a
//                Compress button that summons Patronus with this instruction.
// (Before 2026-11-15 a Compress-style command was its own `pensieve:charm` block — that
// legacy fence is still read, as a `compress` spell — see lib/md/formBlocks, lib/forms/parse.)
// Pure + dependency-free (shared with the phone PWA).

import { DEFAULT_SPELL } from "./kinds";

export const PATRONUS_LANG = "pensieve:patronus";

export type SpellTrigger = "sync" | "compress";

/** The available spells, in menu order: what each is called and what an empty one does. */
export const SPELLS: { id: SpellTrigger; label: string; placeholder: string }[] = [
  { id: "sync", label: "Process on sync", placeholder: DEFAULT_SPELL.form },
  {
    id: "compress",
    label: "Compress",
    placeholder: "What should Patronus compress when you press it? Plain words — it picks the period and what to read.",
  },
];

export const spellLabel = (id: SpellTrigger): string => SPELLS.find((s) => s.id === id)?.label ?? id;

const asSpell = (raw: string | undefined): SpellTrigger =>
  (SPELLS.find((s) => s.id === raw?.toLowerCase())?.id ?? "sync");

export interface PatronusBlock {
  spell: SpellTrigger;
  instruction: string;
}

export function parsePatronus(body: string): PatronusBlock {
  const lines = body.split("\n");
  const m = /^spell:\s*(\S+)\s*$/i.exec((lines[0] ?? "").trim());
  const instruction = (m ? lines.slice(1) : lines).join("\n").trim();
  return { spell: asSpell(m?.[1]), instruction };
}

export function encodePatronus(p: PatronusBlock): string {
  return p.instruction ? `spell: ${p.spell}\n${p.instruction}` : `spell: ${p.spell}`;
}

export function patronusFence(p: PatronusBlock): string {
  return "```" + PATRONUS_LANG + "\n" + encodePatronus(p) + "\n```";
}

interface Found extends PatronusBlock {
  /** Line range of the fence (inclusive) in the markdown it was found in. */
  start: number;
  end: number;
}

/** Every Patronus block in a markdown body, in order. */
export function findAllPatronus(markdown: string): Found[] {
  const out: Found[] = [];
  const lines = markdown.split("\n");
    for (let i = 0; i < lines.length; i++) {
    const open = /^\s*(```|~~~)\s*([\w:-]*)\s*$/.exec(lines[i]);
    if (!open) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== open[1]) j++;
    if (open[2] === PATRONUS_LANG) out.push({ ...parsePatronus(lines.slice(i + 1, j).join("\n")), start: i, end: Math.min(j, lines.length - 1) });
    i = j;
  }
  return out;
}

/** The LAST Patronus block casting `spell` (default: the sync spell — a package ends with
 *  one), or null. */
export function findPatronus(markdown: string, spell: SpellTrigger = "sync"): Found | null {
  return findAllPatronus(markdown).filter((p) => p.spell === spell).pop() ?? null;
}

/** The body with every Patronus block removed (it's consumed when the package resolves),
 *  collapsing the blank lines it leaves behind. */
export function withoutPatronus(markdown: string): string {
  let md = markdown;
  for (let p = findAllPatronus(md).pop(); p; p = findAllPatronus(md).pop()) {
    const lines = md.split("\n");
    lines.splice(p.start, p.end - p.start + 1);
    md = lines.join("\n");
  }
  return md.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
}

/** Put (or replace) the package's Patronus block at the very end. */
export function withPatronus(markdown: string, p: PatronusBlock): string {
  return `${withoutPatronus(markdown)}\n\n${patronusFence(p)}`;
}
