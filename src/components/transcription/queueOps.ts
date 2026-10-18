// Pure operations behind the Process queue — extracted from the hook so the exact
// reorder / merge / model-reset rules are provable without React or I/O.
import type { TranscriptionModel } from "../../lib/transcripts/models";
import type { TranscribePhase } from "../../lib/transcripts/engine";
import type { AudioQueueItem } from "../../lib/transcripts/queue";

export type QueueMode = "all" | "one";

export interface ProcessItem {
  ref: string;
  noteId: string;
  title: string;
  audioName: string;
  type: "audio";
  order: number;
  model: TranscriptionModel;
  pct: number; // 0..100
  phase: TranscribePhase | null;
  error: boolean;
}

export const byOrder = (a: ProcessItem, b: ProcessItem) => a.order - b.order;

/** Items sorted by order. */
export function sortItems(items: ProcessItem[]): ProcessItem[] {
  return [...items].sort(byOrder);
}

/** The row that should run now: the lowest-ordered non-errored item (null if none). */
export function activeItem(items: ProcessItem[]): ProcessItem | null {
  return sortItems(items).find((i) => !i.error) ?? null;
}

/** Move `ref` to position `pos` (1-based, clamped) and renumber 1..n. */
export function reorderItems(items: ProcessItem[], ref: string, pos: number): ProcessItem[] {
  const arr = sortItems(items);
  const idx = arr.findIndex((i) => i.ref === ref);
  if (idx < 0) return items;
  const [it] = arr.splice(idx, 1);
  const p = Math.max(1, Math.min(arr.length + 1, Math.trunc(pos)));
  arr.splice(p - 1, 0, it);
  return arr.map((i, n) => ({ ...i, order: n + 1 }));
}

/** Append any found audio not already queued, as fresh items with the default model. */
export function mergeNewItems(
  prev: ProcessItem[],
  found: AudioQueueItem[],
  defaultModel: TranscriptionModel,
): ProcessItem[] {
  const have = new Set(prev.map((i) => i.ref));
  let order = prev.length;
  const added: ProcessItem[] = [];
  for (const q of found) {
    if (have.has(q.ref)) continue;
    order += 1;
    added.push({
      ref: q.ref,
      noteId: q.noteId,
      title: q.title,
      audioName: q.audioName,
      type: "audio",
      order,
      model: defaultModel,
      pct: 0,
      phase: null,
      error: false,
    });
  }
  return added.length ? [...prev, ...added] : prev;
}

/** Change a row's model — and reset its progress, since it must transcribe from scratch. */
export function setItemModel(items: ProcessItem[], ref: string, model: TranscriptionModel): ProcessItem[] {
  return items.map((i) => (i.ref === ref && i.model !== model ? { ...i, model, pct: 0, error: false } : i));
}

/** Clear errors (and reset their %) so a Run retries previously-failed rows. */
export function clearErrorsForRetry(items: ProcessItem[]): ProcessItem[] {
  return items.map((i) => (i.error ? { ...i, error: false, pct: 0 } : i));
}
