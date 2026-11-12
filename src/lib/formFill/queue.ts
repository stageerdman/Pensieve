// "Which phone form sessions are ready for the desktop to fill?" — the Process queue's form
// rows. Mirrors lib/raw/queue.ts. A session is listed once it's marked awaiting AND every
// recording in it has a transcript (the transcription rows run first, on their own).

import { isAwaitingProcessing } from "../forms";
import type { NoteMeta, Store } from "../types";
import { audioRefsOf } from "./fillForm";

export interface FormQueueItem {
  noteId: string;
  title: string;
}

export type FormQueueStore = Pick<Store, "list" | "load" | "loadTranscript">;

export async function listFormsToFill(store: FormQueueStore): Promise<FormQueueItem[]> {
  const metas: NoteMeta[] = await store.list();
  const out: FormQueueItem[] = [];
  for (const m of metas) {
    if (!isAwaitingProcessing(m.extra)) continue;
    const note = await store.load(m.id);
    if (!note) continue;
    const refs = audioRefsOf(note.markdown);
    const ready = (await Promise.all(refs.map((r) => store.loadTranscript(r)))).every((t) => t !== null);
    if (ready) out.push({ noteId: m.id, title: m.title || "Form" });
  }
  return out;
}
