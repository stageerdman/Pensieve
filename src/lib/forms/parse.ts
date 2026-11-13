// parse.ts — read a form's structure out of plain Markdown.
//
// A form is written like any memory. The grammar is deliberately tiny:
//   - the first prose line is the title (same rule as titleFromMarkdown);
//   - a QUESTION starts at a line that is bold and nothing else (`**Was I a king?**`)
//     or a heading (`## …`) — everything up to the next question is its region;
//   - a region holding a ```pensieve:scale fence is a SCALE field;
//   - a region holding `- [ ]` / `* [x]` items is a CHECKLIST field;
//   - anything else is a QUESTION field (open text: paragraphs, bullets, numbers);
//   - a ```pensieve:charm fence is a CHARM (a named AI command). It belongs to no
//     field and ends the region before it.
// Lines inside a region that aren't the answer (guidance, the scale fence, checklist
// items) are the field's scaffold; answers are written after them (see answers.ts).
//
// Pure + dependency-free (shared with the phone PWA). Line-based on purpose: works on
// the .md as stored, identically on both platforms, with no editor in the loop.

import { stripForeignColorRuns } from "../md/colorRuns";
import { CHARM_LANG, SCALE_LANG, parseCharm, parseScale, type Charm, type Scale } from "./fences";

export type FieldKind = "question" | "scale" | "checklist";

export interface ChecklistItem {
  label: string;
  checked: boolean;
  /** Line index of the item in the source. */
  line: number;
}

export interface FormField {
  /** Stable id derived from the question text (unique within the form). */
  id: string;
  kind: FieldKind;
  question: string;
  /** Line index of the question line. */
  line: number;
  /** Region = lines (line, end) exclusive of the question line; `end` is exclusive. */
  end: number;
  /** Prose lines in the region that aren't list items/fences — the guidance in a
   *  template, guidance + typed answer in a filled memory. */
  text: string[];
  scale?: Scale & { fenceStart: number; fenceEnd: number };
  items?: ChecklistItem[];
}

export interface CharmBlock extends Charm {
  /** Line indices of the opening and closing fence lines (inclusive). */
  start: number;
  end: number;
}

export interface ParsedForm {
  title: string;
  titleLine: number;
  fields: FormField[];
  charms: CharmBlock[];
}

const FENCE_OPEN = /^\s*(```|~~~)\s*([\w:-]*)\s*$/;
const BOLD_ONLY = /^\s*\*\*(?!\s)((?:(?!\*\*).)+?)\*\*\s*$/;
const HEADING = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;
export const CHECK_ITEM = /^(\s*[-*+]\s+)\[([ xX])\](\s*)(.*)$/;

/** The question text of a line, or null if the line doesn't start a field. */
export function questionOf(raw: string): string | null {
  const line = stripForeignColorRuns(raw); // a pasted question can carry `{fg:rgb(…)}` (colorRuns.ts)
  const b = BOLD_ONLY.exec(line);
  if (b) return b[1].trim();
  const h = HEADING.exec(line);
  return h ? h[1].replace(/\*\*/g, "").trim() : null;
}

export function slug(text: string): string {
  const s = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return s || "q";
}

interface Fence {
  start: number;
  end: number; // closing line (inclusive); lines.length - 1 if unterminated
  lang: string;
  body: string;
}

export function scanFences(lines: string[]): Fence[] {
  const out: Fence[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_OPEN.exec(lines[i]);
    if (!m) continue;
    const marker = m[1];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== marker) j++;
    const end = Math.min(j, lines.length - 1);
    out.push({ start: i, end, lang: m[2], body: lines.slice(i + 1, j).join("\n") });
    i = end;
  }
  return out;
}

export function parseForm(markdown: string): ParsedForm {
  const lines = markdown.split("\n");
  const fences = scanFences(lines);
  const fenceAt = new Map(fences.map((f) => [f.start, f] as const));

  // Title: first non-blank line outside a fence.
  let titleLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const f = fenceAt.get(i);
    if (f) {
      i = f.end;
      continue;
    }
    if (lines[i].trim()) {
      titleLine = i;
      break;
    }
  }
  const title =
    titleLine >= 0
      ? lines[titleLine].replace(/^#{1,6}\s*/, "").replace(/\*\*/g, "").trim()
      : "";

  // Boundaries: question lines and charm fences (both outside other fences).
  const charms: CharmBlock[] = [];
  const starts: { line: number; question: string }[] = [];
  const stops: number[] = []; // charm starts end the preceding region too
  for (let i = titleLine + 1; i < lines.length; i++) {
    const f = fenceAt.get(i);
    if (f) {
      if (f.lang === CHARM_LANG) {
        charms.push({ ...parseCharm(f.body), start: f.start, end: f.end });
        stops.push(f.start);
      }
      i = f.end;
      continue;
    }
    const q = questionOf(lines[i]);
    if (q) starts.push({ line: i, question: q });
  }

  const used = new Map<string, number>();
  const fields: FormField[] = starts.map((s, k) => {
    const nextQ = starts[k + 1]?.line ?? lines.length;
    const nextStop = stops.find((x) => x > s.line) ?? lines.length;
    const end = Math.min(nextQ, nextStop);

    const base = slug(s.question);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const id = n > 1 ? `${base}-${n}` : base;

    const text: string[] = [];
    const items: ChecklistItem[] = [];
    let scale: FormField["scale"];
    for (let i = s.line + 1; i < end; i++) {
      const f = fenceAt.get(i);
      if (f) {
        if (f.lang === SCALE_LANG && !scale) {
          scale = { ...parseScale(f.body), fenceStart: f.start, fenceEnd: f.end };
        }
        i = f.end;
        continue;
      }
      const c = CHECK_ITEM.exec(lines[i]);
      if (c) {
        items.push({ label: c[4].trim(), checked: c[2] !== " ", line: i });
        continue;
      }
      if (lines[i].trim()) text.push(lines[i]);
    }
    const kind: FieldKind = scale ? "scale" : items.length ? "checklist" : "question";
    const field: FormField = { id, kind, question: s.question, line: s.line, end, text };
    if (scale) field.scale = scale;
    if (items.length) field.items = items;
    return field;
  });

  return { title, titleLine, fields, charms };
}

/** True when the markdown contains at least one field — i.e. it can be used as a form. */
export function hasFields(markdown: string): boolean {
  return parseForm(markdown).fields.length > 0;
}
