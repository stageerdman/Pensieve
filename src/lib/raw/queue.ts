// "Which synced Raw Memory batches still need AI processing?" — the data layer behind
// the Process queue's journal rows. Mirrors lib/transcripts/queue.ts's shape deliberately
// (listUntranscribedAudio / AudioQueueItem) so the two "what's pending?" scans read the
// same way, even though what they scan is unrelated.
import type { RawMemory, Store } from "../types";
import { packageKind } from "../packages/record";

export type RawBatchStore = Pick<Store, "listRawMemories">;

/** One Raw Memory ready to show as a Process queue row. */
export interface RawBatchQueueItem {
  id: string;
  pageCount: number;
}

/** Only `synced` batches are offered — `capturing`/`queued` aren't fully on this device
 *  yet, and `processing`/`done` are already being handled (see RawMemoryStatus). */
export async function listUnprocessedRawBatches(store: RawBatchStore): Promise<RawBatchQueueItem[]> {
  const all: RawMemory[] = await store.listRawMemories();
  return all
    .filter((rm) => rm.status === "synced" && packageKind(rm) === "journal" && rm.pages.length > 0)
    .map((rm) => ({ id: rm.id, pageCount: rm.pages.length }));
}

/** One synced form PACKAGE waiting for Patronus (see lib/packages). */
export interface PackageQueueItem {
  id: string;
  title: string;
}

export async function listPackagesToResolve(store: RawBatchStore): Promise<PackageQueueItem[]> {
  const all: RawMemory[] = await store.listRawMemories();
  return all
    // "processing" too: one left over from a run the app quit in the middle of must not be
    // stuck forever (the queue de-dupes by id, so a live run is never started twice).
    .filter((rm) => (rm.status === "synced" || rm.status === "processing") && packageKind(rm) === "form" && !!rm.markdown)
    .map((rm) => ({ id: rm.id, title: rm.title || "Form" }));
}
