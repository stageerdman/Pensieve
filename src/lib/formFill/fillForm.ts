// fillForm.ts — Process-queue job: turn a phone form session into a finished ("forged")
// memory. Transcripts in → one Claude call → answers written straight in as plain text
// (owner-decided), the recording stays at the bottom, the "awaiting" mark comes off.
// Deps are injected so the whole path is testable without Tauri or Claude.

import {
  FORM_STATUS_KEY,
  applyAnswers,
  fromFormId,
  isAwaitingProcessing,
  parseForm,
  withExtra,
} from "../forms";
import type { Note, TimelineEntry } from "../types";
import type { Transcript } from "../transcripts/types";
import { buildFillPrompt, fillFieldsOf, parseFillResponse } from "./prompt";
import { log } from "../logger";

export interface FillDeps {
  load(id: string): Promise<Note | null>;
  save(note: Note): Promise<void>;
  loadTranscript(ref: string): Promise<Transcript | null>;
  loadTimeline(id: string): Promise<TimelineEntry[]>;
  saveTimeline(id: string, entries: TimelineEntry[]): Promise<void>;
  ask(prompt: string): Promise<string>;
}

const AUDIO_REF = /```pensieve:audio\n([^\n]+)/g;

export function audioRefsOf(markdown: string): string[] {
  return [...markdown.matchAll(AUDIO_REF)].map((m) => m[1].trim()).filter(Boolean);
}

export function transcriptText(t: Transcript | null): string {
  return (t?.segments ?? []).map((s) => s.text.trim()).filter(Boolean).join(" ");
}

export type FillResult = { status: "filled"; fields: number } | { status: "forged-empty" } | { status: "skipped"; reason: string };

export async function fillFormMemory(noteId: string, deps: FillDeps): Promise<FillResult> {
  const note = await deps.load(noteId);
  if (!note) return { status: "skipped", reason: "memory no longer exists" };
  if (!isAwaitingProcessing(note.extra)) return { status: "skipped", reason: "not awaiting" };

  const refs = audioRefsOf(note.markdown);
  const transcripts = await Promise.all(refs.map((r) => deps.loadTranscript(r)));
  if (transcripts.some((t) => t === null)) throw new Error("recording not transcribed yet");
  const transcript = transcripts.map(transcriptText).filter(Boolean).join("\n\n");

  let markdown = note.markdown;
  let filled = 0;
  if (transcript.trim()) {
    const form = parseForm(markdown);
    const formId = fromFormId(note.extra);
    const template = formId ? await deps.load(formId) : null;
    const prompt = buildFillPrompt(form.title, fillFieldsOf(form.fields, template ? parseForm(template.markdown).fields : undefined), transcript);
    log.info("form", "fill.ask", { id: noteId, fields: form.fields.length, transcriptChars: transcript.length });
    const answers = parseFillResponse(await deps.ask(prompt), form.fields);
    filled = Object.keys(answers).length;
    markdown = applyAnswers(markdown, answers);
  }

  // A restore point first: the Timeline can always bring back exactly what the phone sent.
  if (markdown !== note.markdown) {
    const entries = await deps.loadTimeline(noteId);
    await deps.saveTimeline(noteId, [...entries, { ts: Date.now() - 1, wordDelta: 0, markdown: note.markdown }]);
  }
  await deps.save({ ...note, markdown, extra: withExtra(note.extra, FORM_STATUS_KEY, undefined) });
  log.info("form", "fill.done", { id: noteId, filled });
  return transcript.trim() ? { status: "filled", fields: filled } : { status: "forged-empty" };
}
