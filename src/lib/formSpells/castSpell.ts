// castSpell.ts — press a form spell's button (Compress) on a memory made from a form:
// read the spell from the form → ask Claude (with the vault's read tools) → write the answers
// into the still-open fields with date chips. FORMS Phase 6.
//
// The write reuses the form fill's path (lib/forms applyAnswers: text is only ever added,
// a scale only set when unrated, a tick never undone) and leaves a Timeline restore point
// first. Fields are re-checked against the memory as it is AFTER the AI answered: anything
// the owner typed while the spell ran is theirs and is skipped.
// Deps are injected so the whole path is testable without Tauri or Claude.

import { applyAnswers, fromFormId, isFormTemplate, parseForm } from "../forms";
import type { Note, TimelineEntry } from "../types";
import { log } from "../logger";
import { openFields, spellsOf } from "./spells";
import { buildSpellPrompt, citedIds, parseSpellResponse } from "./prompt";
import { toAnswers, type CitedMemory } from "./cite";

export interface SpellDeps {
  load(id: string): Promise<Note | null>;
  save(note: Note): Promise<void>;
  loadTimeline(id: string): Promise<TimelineEntry[]>;
  saveTimeline(id: string, entries: TimelineEntry[]): Promise<void>;
  /** Claude with the Pensieve MCP read tools (ai_text.rs ask_claude_with_vault). */
  ask(prompt: string): Promise<string>;
  /** Called once the AI has answered, right before the memory is re-read and written:
   *  the editor flushes its pending edits so the owner's latest typing is on disk. */
  settle?(): Promise<void>;
  now?(): Date;
}

export type SpellResult =
  | { status: "filled"; fields: number; cited: number }
  /** Every field already has the owner's answer — nothing was asked. */
  | { status: "all-answered" }
  /** The AI found nothing (citable) to add. */
  | { status: "nothing-found" }
  | { status: "skipped"; reason: string };

export async function castSpell(noteId: string, spellName: string, deps: SpellDeps): Promise<SpellResult> {
  const note = await deps.load(noteId);
  if (!note) return { status: "skipped", reason: "memory no longer exists" };
  const formId = fromFormId(note.extra);
  const form = formId ? await deps.load(formId) : null;
  if (!formId || !form) return { status: "skipped", reason: "its form no longer exists" };
  const spell = spellsOf(note.extra, form.markdown).find((s) => s.name === spellName);
  if (!spell) return { status: "skipped", reason: `the form has no ${spellName} spell` };

  const formFields = parseForm(form.markdown).fields;
  const open = openFields(note.markdown, formFields);
  if (!open.length) {
    log.info("spell", "cast.allAnswered", { id: noteId, spell: spellName });
    return { status: "all-answered" };
  }

  const now = deps.now?.() ?? new Date();
  const prompt = buildSpellPrompt({
    spell,
    formId,
    formTitle: form.title || parseForm(form.markdown).title || "Form",
    memoryId: noteId,
    memoryTitle: note.title || parseForm(note.markdown).title,
    memoryDate: new Date(note.createdAt),
    today: now,
    fields: open,
  });
  log.info("spell", "cast.ask", { id: noteId, spell: spellName, formId, open: open.map((f) => f.id), promptChars: prompt.length });
  const t0 = Date.now();
  const raw = await deps.ask(prompt);
  const parsed = parseSpellResponse(raw, open);
  log.info("spell", "cast.answer", { id: noteId, ms: Date.now() - t0, replyChars: raw.length, fields: Object.keys(parsed) });

  // Resolve every cited id to a real memory (its own date drives the chip). This memory,
  // its form and any form template can't be sources.
  const cited = new Map<string, CitedMemory>();
  for (const id of citedIds(parsed)) {
    if (id === noteId || id === formId) continue;
    const m = await deps.load(id);
    if (m && !isFormTemplate(m.extra)) cited.set(id, { id, createdAt: m.createdAt });
  }
  const { answers, dropped } = toAnswers(parsed, cited);
  if (dropped) log.warn("spell", "cast.uncitedDropped", { id: noteId, dropped });

  // Write into the memory as it is NOW, and only into fields still open now.
  await deps.settle?.();
  const latest = await deps.load(noteId);
  if (!latest) return { status: "skipped", reason: "memory no longer exists" };
  const stillOpen = new Set(openFields(latest.markdown, formFields).map((f) => f.id));
  for (const id of Object.keys(answers)) if (!stillOpen.has(id)) delete answers[id];
  const fields = Object.keys(answers).length;
  if (!fields) {
    log.info("spell", "cast.nothingFound", { id: noteId, spell: spellName });
    return { status: "nothing-found" };
  }

  const markdown = applyAnswers(latest.markdown, answers);
  if (markdown === latest.markdown) return { status: "nothing-found" };
  const entries = await deps.loadTimeline(noteId);
  await deps.saveTimeline(noteId, [...entries, { ts: Date.now() - 1, wordDelta: 0, markdown: latest.markdown, label: "before-spell" }]);
  await deps.save({ ...latest, markdown });
  log.info("spell", "cast.done", { id: noteId, spell: spellName, fields, cited: cited.size });
  return { status: "filled", fields, cited: cited.size };
}
