// redo.ts — "Redo with AI": put a filled form memory back to what arrived BEFORE the AI
// touched it, so the Process queue transcribes (with the language the owner picks) and
// fills it again. Nothing is lost: the current AI result goes to the Timeline first
// ("before-redo"), so the redo itself can be undone from the Timeline.
// Pure + injected deps (testable without Tauri).

import { FORM_STATUS_KEY, fromFormId, isAwaitingProcessing, withExtra } from "../forms";
import type { Note, TimelineEntry } from "../types";
import { audioRefsOf } from "./fillForm";

/** The snapshot a Redo returns to: the newest "before-ai" entry. Fills made before labels
 *  existed (2026-11-13) left an unlabeled zero-delta snapshot that still holds the
 *  recording — accepted as a fallback. */
export function beforeAiEntry(entries: TimelineEntry[]): TimelineEntry | undefined {
  const labeled = entries.filter((e) => e.label === "before-ai" && e.markdown);
  if (labeled.length) return labeled[labeled.length - 1];
  const legacy = entries.filter((e) => !e.label && e.wordDelta === 0 && !e.created && e.markdown?.includes("```pensieve:audio"));
  return legacy[legacy.length - 1];
}

/** Can this memory be redone? Made from a form, already processed, has a recording and a
 *  restore point. */
export function canRedo(note: Note, entries: TimelineEntry[]): boolean {
  return (
    !!fromFormId(note.extra) &&
    !isAwaitingProcessing(note.extra) &&
    audioRefsOf(note.markdown).length > 0 &&
    !!beforeAiEntry(entries)
  );
}

export interface RedoDeps {
  load(id: string): Promise<Note | null>;
  save(note: Note): Promise<void>;
  loadTimeline(id: string): Promise<TimelineEntry[]>;
  saveTimeline(id: string, entries: TimelineEntry[]): Promise<void>;
}

/** Reset the memory for a fresh fill. Returns the recordings to re-transcribe, or null if
 *  it can't be redone. */
export async function resetForRedo(noteId: string, deps: RedoDeps, now = Date.now()): Promise<string[] | null> {
  const note = await deps.load(noteId);
  if (!note) return null;
  const entries = await deps.loadTimeline(noteId);
  if (!canRedo(note, entries)) return null;
  const before = beforeAiEntry(entries)!;
  await deps.saveTimeline(noteId, [...entries, { ts: now, wordDelta: 0, markdown: note.markdown, label: "before-redo" }]);
  await deps.save({ ...note, markdown: before.markdown!, extra: withExtra(note.extra, FORM_STATUS_KEY, "awaiting") });
  return audioRefsOf(before.markdown!);
}
