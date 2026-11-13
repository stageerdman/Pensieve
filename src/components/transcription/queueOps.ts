// Pure operations behind the Process queue — extracted from the hook so the exact
// reorder / merge / model-reset rules are provable without React or I/O.
import type { TranscriptionModel } from "../../lib/transcripts/models";
import type { TranscribePhase } from "../../lib/transcripts/engine";
import type { AudioQueueItem } from "../../lib/transcripts/queue";
import type { RawBatchQueueItem } from "../../lib/raw/queue";
import type { FormQueueItem } from "../../lib/formFill/queue";

export type QueueMode = "all" | "one";

interface BaseProcessItem {
  ref: string; // the queue key — an audio ref, or a Raw Memory id for a journal row
  order: number;
  pct: number; // 0..100
  phase: TranscribePhase | null;
  error: boolean;
  errorMsg?: string; // the engine/invoke failure reason, shown on hover over the error icon
}

export interface AudioProcessItem extends BaseProcessItem {
  type: "audio";
  noteId: string;
  title: string;
  audioName: string;
  model: TranscriptionModel;
}

/** A Journal batch awaiting the Phase 5 AI split — same row shell as audio (ProcessRow is
 *  generic), no model badge, no audio preview. See wiki.md "A — no separate section." */
export interface JournalProcessItem extends BaseProcessItem {
  type: "journal";
  pageCount: number;
}

/** A phone form session awaiting its fill (FORMS Phase 5): transcript → AI writes the answers
 *  in → the memory is "forged". Same row shell; no model, no preview. ref = `form:<noteId>`. */
export interface FormProcessItem extends BaseProcessItem {
  type: "form";
  noteId: string;
  title: string;
}

export type ProcessItem = AudioProcessItem | JournalProcessItem | FormProcessItem;

export function isAudioItem(i: ProcessItem): i is AudioProcessItem {
  return i.type === "audio";
}
export function isJournalItem(i: ProcessItem): i is JournalProcessItem {
  return i.type === "journal";
}
export function isFormItem(i: ProcessItem): i is FormProcessItem {
  return i.type === "form";
}
export const formRef = (noteId: string) => `form:${noteId}`;

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

/** Append any found audio not already queued, as fresh items with the default model.
 *  `persisted` (ref → saved {model, order}) restores a row's model + ordering after an app
 *  restart; refs without a saved entry fall back to the default model and the next order #. */
export function mergeNewItems(
  prev: ProcessItem[],
  found: AudioQueueItem[],
  defaultModel: TranscriptionModel,
  persisted?: Record<string, { model?: TranscriptionModel; order: number }>,
): ProcessItem[] {
  const have = new Set(prev.map((i) => i.ref));
  let order = prev.length;
  const added: ProcessItem[] = [];
  for (const q of found) {
    if (have.has(q.ref)) continue;
    order += 1;
    const saved = persisted?.[q.ref];
    added.push({
      ref: q.ref,
      noteId: q.noteId,
      title: q.title,
      audioName: q.audioName,
      type: "audio",
      order: saved?.order ?? order,
      model: saved?.model ?? defaultModel,
      pct: 0,
      phase: null,
      error: false,
    });
  }
  return added.length ? [...prev, ...added] : prev;
}

/** Change an audio row's model — and reset its progress, since it must transcribe from
 *  scratch. A no-op for a journal row (it has no model) or an unknown ref. */
export function setItemModel(items: ProcessItem[], ref: string, model: TranscriptionModel): ProcessItem[] {
  return items.map((i) =>
    i.type === "audio" && i.ref === ref && i.model !== model
      ? { ...i, model, pct: 0, error: false, errorMsg: undefined }
      : i,
  );
}

/** Append any found unprocessed Raw Memory batches not already queued, as fresh journal
 *  rows. Mirrors mergeNewItems's shape exactly (see queueOps.test.ts). */
export function mergeNewJournalItems(
  prev: ProcessItem[],
  found: RawBatchQueueItem[],
  persisted?: Record<string, { order: number }>,
): ProcessItem[] {
  const have = new Set(prev.map((i) => i.ref));
  let order = prev.length;
  const added: ProcessItem[] = [];
  for (const q of found) {
    if (have.has(q.id)) continue;
    order += 1;
    const saved = persisted?.[q.id];
    added.push({
      ref: q.id,
      type: "journal",
      pageCount: q.pageCount,
      order: saved?.order ?? order,
      pct: 0,
      phase: null,
      error: false,
    });
  }
  return added.length ? [...prev, ...added] : prev;
}

/** Append any phone form sessions ready to fill, not already queued. Mirrors
 *  mergeNewJournalItems. */
export function mergeNewFormItems(
  prev: ProcessItem[],
  found: FormQueueItem[],
  persisted?: Record<string, { order: number }>,
): ProcessItem[] {
  const have = new Set(prev.map((i) => i.ref));
  let order = prev.length;
  const added: ProcessItem[] = [];
  for (const q of found) {
    const ref = formRef(q.noteId);
    if (have.has(ref)) continue;
    if (q.audioRefs.some((r) => have.has(r))) continue; // its recording is (re)transcribing first
    order += 1;
    added.push({ ref, type: "form", noteId: q.noteId, title: q.title, order: persisted?.[ref]?.order ?? order, pct: 0, phase: null, error: false });
  }
  return added.length ? [...prev, ...added] : prev;
}

/** Clear errors (and reset their %) so a Run retries previously-failed rows. */
export function clearErrorsForRetry(items: ProcessItem[]): ProcessItem[] {
  return items.map((i) => (i.error ? { ...i, error: false, errorMsg: undefined, pct: 0 } : i));
}
