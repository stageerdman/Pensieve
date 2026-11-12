// answers.ts — turn a form into a memory, and write answers into a memory.
//
// The one rule (owner-decided): answers are plain text in the memory, and the owner's
// own input is never rewritten. AI text is only ever ADDED after what's there; a scale
// is only set when unrated; a checklist item is only ever ticked, never unticked.
//
// Pure + dependency-free (shared with the phone PWA).

import { SCALE_LANG, encodeScale, fence } from "./fences";
import { parseForm, CHECK_ITEM, type FormField } from "./parse";

/** A form template → the body of a new memory: the same questions, with every charm
 *  left out (charms live only in the template; a memory shows them as buttons). */
export function instantiate(templateMd: string): string {
  const lines = templateMd.split("\n");
  const { charms } = parseForm(templateMd);
  const drop = new Set<number>();
  for (const c of charms) for (let i = c.start; i <= c.end; i++) drop.add(i);
  const kept = lines.filter((_, i) => !drop.has(i));
  // Collapse the blank runs a removed charm leaves behind, and trailing blanks.
  const out: string[] = [];
  for (const l of kept) {
    if (!l.trim() && out.length && !out[out.length - 1].trim()) continue;
    out.push(l);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join("\n");
}

export interface FieldAnswer {
  /** Markdown to add to the field's answer (paragraphs / bullets / numbers). */
  text?: string;
  /** A rating for a scale field — applied only if the scale is unrated. */
  scale?: number;
  /** Checklist labels to tick (matched case-insensitively) — never unticks. */
  check?: string[];
}

export type Answers = Record<string, FieldAnswer>;

const EMPTY_LIST_ITEM = /^\s*([-*+]|\d+[.)])\s*$/;

/** The typed answer of a field: its prose lines minus the template's scaffold (the
 *  guidance lines the template already had for that field). */
export function answerText(field: FormField, templateField?: FormField): string {
  const scaffold = new Set((templateField?.text ?? []).map((l) => l.trim()));
  return field.text
    .filter((l) => !scaffold.has(l.trim()) && !EMPTY_LIST_ITEM.test(l))
    .join("\n")
    .trim();
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Apply answers to a memory's markdown. Unknown field ids are ignored. */
export function applyAnswers(markdown: string, answers: Answers): string {
  const lines = markdown.split("\n");
  const { fields } = parseForm(markdown);
  // Bottom-up so earlier line indices stay valid while we splice.
  for (const f of [...fields].sort((a, b) => b.line - a.line)) {
    const a = answers[f.id];
    if (!a) continue;

    if (a.check?.length && f.items) {
      const want = new Set(a.check.map(norm));
      for (const it of f.items) {
        if (it.checked || !want.has(norm(it.label))) continue;
        lines[it.line] = lines[it.line].replace(CHECK_ITEM, "$1[x]$3$4");
      }
    }

    if (a.scale !== undefined && f.scale && f.scale.value === undefined) {
      const v = Math.round(a.scale);
      if (v >= 1 && v <= f.scale.anchors.length) {
        const body = encodeScale({ anchors: f.scale.anchors, value: v });
        const block = fence(SCALE_LANG, body).split("\n");
        lines.splice(f.scale.fenceStart, f.scale.fenceEnd - f.scale.fenceStart + 1, ...block);
      }
    }

    const text = a.text?.trim();
    if (text) {
      // Re-parse this field's region bounds against the CURRENT lines (the scale splice
      // above may have shifted them by a line).
      const cur = parseForm(lines.join("\n")).fields.find((x) => x.line === f.line);
      const end = cur ? cur.end : f.end;
      // Drop empty list starters ("* ", "1.") and trailing blanks at the region's end,
      // then add the text after the last real line.
      let last = end - 1;
      while (last > f.line && (!lines[last].trim() || EMPTY_LIST_ITEM.test(lines[last]))) {
        if (EMPTY_LIST_ITEM.test(lines[last])) lines.splice(last, 1);
        last--;
      }
      const insert = ["", ...text.split("\n")];
      const after = last + 1;
      // Keep one blank line before whatever follows (next question / charm / EOF).
      if (after < lines.length && lines[after].trim()) insert.push("");
      lines.splice(after, 0, ...insert);
    }
  }
  return lines.join("\n");
}
