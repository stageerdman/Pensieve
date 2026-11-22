// canonical.ts — a memory's text in the one shape every editor re-saves it in, for the
// "did the owner change it since?" check only (never written). The phone and the desktop
// rewrite lists when they merely re-save a memory: `- ` becomes `* `, ordered items are
// renumbered, nesting is re-indented 2 spaces per level, `[X]` becomes `[x]`. None of that is
// an edit, so none of it may refuse an Undo. Mirrors phone/src/lib/media/noteMedia.ts's list
// grammar (the two apps are decoupled). Pure.

const LIST_LINE = /^(\s*)(?:([*-])|\d+\.)\s+(?:\[([ xX])\]\s+)?(.*)$/;

function canonicalListLine(m: RegExpExecArray, depth: number): string {
  const [, , bullet, check, text] = m;
  const marker = bullet ? "* " : "1. ";
  const box = check === undefined ? "" : `[${check.trim() ? "x" : " "}] `;
  return "  ".repeat(depth) + marker + box + text;
}

export function canonicalText(text: string): string {
  const out: string[] = [];
  let indents: number[] = []; // the open nesting levels of the current list run
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const m = LIST_LINE.exec(line);
    if (!m) {
      indents = [];
      out.push(line);
      continue;
    }
    const indent = m[1].length;
    while (indents.length && indents[indents.length - 1] >= indent) indents.pop();
    out.push(canonicalListLine(m, indents.length));
    indents.push(indent);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
