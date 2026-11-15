// prompt.ts — the AI contract for filling a form from what the owner SAID (FORMS Phase 5).
// Pure: build the prompt, parse the reply. The reply is validated against the form's real
// fields, so the model can only ever ADD answers to questions that exist (applyAnswers then
// enforces "never override the owner": text appends, a scale is set only if unrated, a
// checklist item is only ever ticked).

import { answerText, type Answers, type FormField } from "../forms";

export interface FillField {
  field: FormField;
  /** What the owner already typed/ticked/rated for it (so AI only adds what's new). */
  typed: string;
}

export function describeField(f: FillField): string {
  const { field } = f;
  const lines = [`- id: ${field.id}`, `  question: ${field.question}`, `  kind: ${field.kind}`];
  if (field.kind === "scale" && field.scale) {
    lines.push(`  points: ${field.scale.anchors.map((a, i) => `${i + 1} = ${a || "(no label)"}`).join("; ")}`);
    lines.push(`  already rated: ${field.scale.value ?? "no"}`);
  }
  if (field.kind === "checklist" && field.items) {
    lines.push(`  items: ${field.items.map((i) => `${i.checked ? "[x]" : "[ ]"} ${i.label}`).join(" | ")}`);
  }
  const guide = field.kind === "question" ? field.text.filter((l) => !f.typed.includes(l.trim())).join(" ").trim() : "";
  if (guide && !f.typed) lines.push(`  guidance: ${guide}`);
  if (f.typed) lines.push(`  already answered (keep, only add to it): ${f.typed.replace(/\n/g, " / ")}`);
  return lines.join("\n");
}

export function buildFillPrompt(formTitle: string, fields: FillField[], transcript: string): string {
  return `You are filling in the owner's own journal form "${formTitle}" from a voice recording they made while walking through it. The transcript is below. It is ONE continuous recording covering all questions in order; they may skip questions, answer out of order, or come back to one.

The form's fields:
${fields.map(describeField).join("\n")}

Rules:
- Write every answer in the SAME language the owner spoke, in the first person, as their own words: faithful, concise, no invented facts, no coaching, no commentary.
- "question" fields: put what they said for that question in "text". If the field already has an answer, return ONLY what the recording ADDS (never repeat what's typed); return nothing if it adds nothing. Use "* " bullet lines when they listed several things.
- "scale" fields: set "scale" (a whole number within the points) ONLY if they clearly gave a rating, and only if it isn't already rated.
- "checklist" fields: list in "check" the EXACT item labels they clearly said they did. Never untick anything.
- Leave out any field the recording says nothing about.

Respond with ONLY one JSON object, no markdown fence, no explanation:
{"answers": {"<field id>": {"text": "<markdown>", "scale": <number>, "check": ["<exact item label>"]}}}

Transcript:
"""
${transcript.trim()}
"""`;
}

/** Defensive parse: tolerate a code fence / prose around the JSON; keep only answers for real
 *  field ids with the right shape for that field's kind. Never throws (bad reply → {}). */
export function parseFillResponse(raw: string, fields: FormField[]): Answers {
  let text = raw.trim();
  if (text.startsWith("```")) text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
  const answers = (parsed as { answers?: Record<string, unknown> })?.answers;
  if (!answers || typeof answers !== "object") return {};
  const out: Answers = {};
  for (const f of fields) {
    const a = answers[f.id] as { text?: unknown; scale?: unknown; check?: unknown } | undefined;
    if (!a || typeof a !== "object") continue;
    const entry: Answers[string] = {};
    if (typeof a.text === "string" && a.text.trim()) entry.text = a.text.trim();
    if (f.kind === "scale" && typeof a.scale === "number" && Number.isFinite(a.scale)) entry.scale = Math.round(a.scale);
    if (f.kind === "checklist" && Array.isArray(a.check)) {
      const labels = new Set((f.items ?? []).map((i) => i.label.trim().toLowerCase()));
      const check = a.check.filter((c): c is string => typeof c === "string" && labels.has(c.trim().toLowerCase()));
      if (check.length) entry.check = check;
    }
    if (Object.keys(entry).length) out[f.id] = entry;
  }
  return out;
}

/** Field + what's already typed for it, for the prompt. `templateFields` (the form's own
 *  fields, if the form still exists) lets guidance lines be told apart from typed answers. */
export function fillFieldsOf(fields: FormField[], templateFields?: FormField[]): FillField[] {
  const byId = new Map((templateFields ?? []).map((t) => [t.id, t] as const));
  return fields.map((field) => ({ field, typed: answerText(field, byId.get(field.id)) }));
}
