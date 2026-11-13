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
// `spell` names WHEN it runs (only `sync` today: "on arrival at the desktop"); the rest of the
// fence is the instruction, verbatim. A form template may hold one too — it then overrides
// the default instruction for packages made from that form.
// Pure + dependency-free (shared with the phone PWA).

export const PATRONUS_LANG = "pensieve:patronus";

export type SpellTrigger = "sync";

export interface PatronusBlock {
  spell: SpellTrigger;
  instruction: string;
}

export function parsePatronus(body: string): PatronusBlock {
  const lines = body.split("\n");
  const m = /^spell:\s*(\S+)\s*$/i.exec((lines[0] ?? "").trim());
  const instruction = (m ? lines.slice(1) : lines).join("\n").trim();
  return { spell: "sync", instruction };
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

/** The LAST Patronus block in a markdown body (a package ends with one), or null. */
export function findPatronus(markdown: string): Found | null {
  const lines = markdown.split("\n");
  let found: Found | null = null;
  for (let i = 0; i < lines.length; i++) {
    const open = /^\s*(```|~~~)\s*([\w:-]*)\s*$/.exec(lines[i]);
    if (!open) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== open[1]) j++;
    if (open[2] === PATRONUS_LANG) found = { ...parsePatronus(lines.slice(i + 1, j).join("\n")), start: i, end: Math.min(j, lines.length - 1) };
    i = j;
  }
  return found;
}

/** The body with every Patronus block removed (it's consumed when the package resolves),
 *  collapsing the blank lines it leaves behind. */
export function withoutPatronus(markdown: string): string {
  let md = markdown;
  for (let p = findPatronus(md); p; p = findPatronus(md)) {
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
