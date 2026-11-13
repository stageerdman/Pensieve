// answers.ts — turn a form into a memory, and write answers into a memory.
//
// The one rule (owner-decided): answers are plain text in the memory, and the owner's
// own input is never rewritten. AI text is only ever ADDED after what's there; a scale
// is only set when unrated; a checklist item is only ever ticked, never unticked.
//
// Pure + dependency-free (shared with the phone PWA).

import { SCALE_LANG, encodeScale, fence } from "./fences";
import { parseForm, scanFences, CHECK_ITEM, type FormField } from "./parse";

/** A form template → the body of a new memory: the same questions, blank (no rating, no
 *  ticks), with every charm left out (charms live only in the template; a memory shows
 *  them as buttons). */
export function instantiate(templateMd: string): string {
  const lines = templateMd.split("\n");
  const { charms, fields } = parseForm(templateMd);
  const drop = new Set<number>();
  for (const c of charms) for (let i = c.start; i <= c.end; i++) drop.add(i);
  // A new memory starts blank: a rating or tick left on the form itself isn't carried over.
  for (const f of fields) {
    for (const it of f.items ?? []) lines[it.line] = lines[it.line].replace(CHECK_ITEM, "$1[ ]$3$4");
    if (f.scale?.value !== undefined) {
      for (let i = f.scale.fenceStart + 1; i < f.scale.fenceEnd; i++) {
        if (/^\s*value:/i.test(lines[i])) drop.add(i);
      }
    }
  }
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
/** The desktop editor keeps a blank paragraph as a zero-width space (lib/md/extended.ts);
 *  String.trim() does NOT strip it, so it must be named explicitly. */
const ZWSP = "\u200b";
const isFiller = (l: string) => !l.replace(/\u200b/g, "").trim() || EMPTY_LIST_ITEM.test(l);

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
      // The answer goes RIGHT UNDER the question (or under what's already typed). Walk back
      // from the region's end over its "tail": filler (blank lines, the desktop's ZWSP spacer
      // paragraphs, empty "* " / "1." starters) and any trailing media fence (a session's
      // recording sits at the very bottom, inside the LAST field's region — the answer must
      // land above it, not under it).
      const media = new Map(
        scanFences(lines).filter((x) => x.lang !== SCALE_LANG && x.start > f.line && x.end < end).map((x) => [x.end, x] as const),
      );
      let last = end - 1;
      while (last > f.line) {
        const fz = media.get(last);
        if (fz) {
          last = fz.start - 1;
          continue;
        }
        if (!isFiller(lines[last])) break;
        last--;
      }
      // Rebuild the tail: answer, then one spacer if the template had one, then the media.
      const tail = lines.slice(last + 1, end);
      const hadSpacer = tail.some((l) => l.includes(ZWSP));
      const keptMedia = [...media.values()]
        .filter((x) => x.start > last)
        .sort((x, y) => x.start - y.start)
        .map((fz) => lines.slice(fz.start, fz.end + 1));
      const seg = ["", ...text.split("\n")];
      if (hadSpacer) seg.push("", ZWSP);
      for (const m of keptMedia) seg.push("", ...m);
      if (end < lines.length) seg.push(""); // a blank line before the next question
      lines.splice(last + 1, end - (last + 1), ...seg);
    }
  }
  return lines.join("\n");
}
