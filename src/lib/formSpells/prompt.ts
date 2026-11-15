// prompt.ts — the AI contract for a form spell (Compress): build the prompt, parse the reply.
// FORMS Phase 6.
//
// The model gets the owner's instruction, the memory's still-open fields, today's date and
// this memory's id/date, plus the Pensieve MCP READ tools (list_notes by day range +
// fromForm, search_notes, get_note). It picks its own period, reads, and answers ONE JSON
// object in the form-fill envelope (lib/formFill/prompt.ts) where a question's answer is
// a list of POINTS, each citing the memories it came from by id. The app turns those ids
// into date chips (cite.ts) — the model never writes a date itself, so a chip can't lie.
//
// Pure.

import type { FormField } from "../forms";
import { answersObjectOf, describeField, parseFillResponse } from "../formFill/prompt";
import type { FormSpell } from "./spells";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** `YYYY-MM-DD` of a date on the LOCAL calendar — the same day key the MCP tools use. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface SpellContext {
  spell: FormSpell;
  formId: string;
  formTitle: string;
  memoryId: string;
  memoryTitle: string;
  /** The memory's own date (its createdAt). */
  memoryDate: Date;
  today: Date;
  /** The fields to fill — only the unanswered ones (spells.ts openFields). */
  fields: FormField[];
}

const DEFAULT_INSTRUCTION =
  "Answer this form's questions from the owner's memories of the period this memory covers.";

export function buildSpellPrompt(c: SpellContext): string {
  const instruction = c.spell.prompt.trim() || DEFAULT_INSTRUCTION;
  const fields = c.fields.map((field) => describeField({ field, typed: "" })).join("\n");
  return `You are casting the owner's "${c.spell.name}" spell on one of their journal memories in Pensieve, their private notes app.

The memory: "${c.memoryTitle}" (id ${c.memoryId}, dated ${isoDay(c.memoryDate)}), made from their form "${c.formTitle}" (form id ${c.formId}).
Today is ${isoDay(c.today)} (${DAYS[c.today.getDay()]}).

The spell's instruction, written by the owner on the form:
"""
${instruction}
"""

How to work:
- Decide the period and which memories to read yourself, from the instruction. If it doesn't say, use the period this memory covers (e.g. a weekly form = the 7 days up to and including ${isoDay(c.memoryDate)}).
- Use the Pensieve tools. list_notes lists memories by day (from/to as YYYY-MM-DD, inclusive) and can keep only those made from one form (from_form = a form id, e.g. another form's memories, or this form's ${c.formId} for earlier ones); set full: true to read a short period in one call. search_notes finds a word or phrase; get_note reads one memory in full.
- Never use this memory itself (${c.memoryId}) or a form template as a source.

Fill in these fields of this memory (the owner already answered the others; leave those alone):
${fields}

Rules:
- Write in the language the source memories are written in, first person, as the owner's own notes: concise and concrete, no invented facts, no coaching, no commentary.
- "question" fields: give "points", each one short statement (one line, no bullet mark, no date) with "sources": the ids of the memories it comes from, exactly as the tools returned them. Every point must have at least one source. At most 6 points per field, the most important first.
- "scale" fields: set "scale" (a whole number within the points) only if the memories clearly support it.
- "checklist" fields: list in "check" the EXACT item labels the memories clearly show were done.
- Leave out any field the memories say nothing about. Never make something up to fill a field.

Respond with ONLY one JSON object, no markdown fence, no explanation:
{"period": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}, "answers": {"<field id>": {"points": [{"text": "<one statement>", "sources": ["<memory id>"]}], "scale": <number>, "check": ["<exact item label>"]}}}`;
}

export interface SpellPoint {
  text: string;
  sources: string[];
}

export interface SpellAnswer {
  points?: SpellPoint[];
  scale?: number;
  check?: string[];
}

export type SpellAnswers = Record<string, SpellAnswer>;

/** One line, no bullet mark, no braces (a `{` could open a note-link/colour token in .md). */
export function cleanPointText(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, "")
    .trim();
}

/** Defensive parse against the fields that were asked for: unknown ids, wrong shapes and
 *  garbage are dropped; never throws (a bad reply → {}). Scale/checklist validation is the
 *  form fill's own (parseFillResponse). */
export function parseSpellResponse(raw: string, fields: FormField[]): SpellAnswers {
  const answers = answersObjectOf(raw);
  if (!answers) return {};
  const filled = parseFillResponse(raw, fields);
  const out: SpellAnswers = {};
  for (const f of fields) {
    const entry: SpellAnswer = {};
    const a = answers[f.id] as { points?: unknown } | undefined;
    if (f.kind === "question" && a && Array.isArray(a.points)) {
      const points: SpellPoint[] = [];
      for (const p of a.points as { text?: unknown; sources?: unknown }[]) {
        const text = typeof p?.text === "string" ? cleanPointText(p.text) : "";
        if (!text) continue;
        const raw: unknown[] = Array.isArray(p.sources) ? p.sources : [];
        const sources = [...new Set(raw.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim()))];
        points.push({ text, sources });
      }
      if (points.length) entry.points = points;
    }
    const v = filled[f.id];
    if (v?.scale !== undefined) entry.scale = v.scale;
    if (v?.check) entry.check = v.check;
    if (Object.keys(entry).length) out[f.id] = entry;
  }
  return out;
}

/** The ids every point cites, deduplicated, in first-seen order. */
export function citedIds(answers: SpellAnswers): string[] {
  const ids = new Set<string>();
  for (const a of Object.values(answers)) for (const p of a.points ?? []) for (const s of p.sources) ids.add(s);
  return [...ids];
}
