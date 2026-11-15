// spells.ts — which button spells (Compress, …) a memory gets, and which of its fields a
// spell may fill. FORMS Phase 6.
//
// A spell lives in the FORM (a `pensieve:patronus` block with `spell: compress`, or a legacy
// `pensieve:charm`), never in the memory: a memory made from the form (`fromForm`) shows one
// button per spell, and the instruction is read from the form when pressed. A spell only
// ever writes into fields the owner hasn't answered yet ("fields you're typing in are
// skipped": anything typed, rated or ticked is the owner's and is left alone).
//
// Pure: no I/O, no DOM.

import { answerText, fromFormId, isFormTemplate, parseForm, type Extra, type FormField } from "../forms";

export interface FormSpell {
  /** The button label, e.g. "Compress". */
  name: string;
  /** The owner's instruction, verbatim (may be empty: the default for that spell applies). */
  prompt: string;
}

/** The spells a memory's buttons show: the button spells of the form it was made from.
 *  None for a form itself, a memory not made from a form, or when the form is gone. */
export function spellsOf(extra: Extra, templateMarkdown: string | null | undefined): FormSpell[] {
  if (isFormTemplate(extra) || !fromFormId(extra) || !templateMarkdown) return [];
  const seen = new Set<string>();
  const out: FormSpell[] = [];
  for (const c of parseForm(templateMarkdown).charms) {
    const name = c.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue; // two blocks with one name = one button
    seen.add(name.toLowerCase());
    out.push({ name, prompt: c.prompt.trim() });
  }
  return out;
}

/** True when the owner has put anything into the field (typed text beyond the form's own
 *  guidance, a rating, a tick). */
export function isAnswered(field: FormField, templateField?: FormField): boolean {
  if (field.kind === "scale") return field.scale?.value !== undefined;
  if (field.kind === "checklist") return (field.items ?? []).some((i) => i.checked);
  return answerText(field, templateField) !== "";
}

/** The memory's fields a spell may still fill (unanswered), in order. */
export function openFields(memoryMarkdown: string, templateFields: FormField[]): FormField[] {
  const byId = new Map(templateFields.map((t) => [t.id, t] as const));
  return parseForm(memoryMarkdown).fields.filter((f) => !isAnswered(f, byId.get(f.id)));
}

/** A failed run → one short, honest line for the strip (the full error goes to the log). */
export function spellErrorText(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err ?? "")).trim();
  const low = raw.toLowerCase();
  if (low.includes("__tauri") || (low.includes("invoke") && low.includes("undefined"))) return "Needs the desktop app";
  if (low.includes("didn't answer within") || low.includes("timed out")) return "Claude took too long";
  if (low.includes("spawn failed") || low.includes("not installed")) return "Claude Code isn't installed";
  if (low.includes("log in") || low.includes("login") || low.includes("not logged") || low.includes("401") || low.includes("authenticat"))
    return "Claude Code isn't signed in";
  const first = raw.split("\n")[0] || "Something went wrong";
  return first.length > 80 ? first.slice(0, 79) + "…" : first;
}
