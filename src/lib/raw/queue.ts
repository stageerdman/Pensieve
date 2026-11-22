// "Which synced Raw Memory batches still need AI processing?" — the data layer behind
// the Process queue's journal rows. Mirrors lib/transcripts/queue.ts's shape deliberately
// (listUntranscribedAudio / AudioQueueItem) so the two "what's pending?" scans read the
// same way, even though what they scan is unrelated.
import type { RawMemory, Store } from "../types";
import { packageKind } from "../packages/record";
import { log } from "../logger";
import type { JobStore } from "./job/jobRecord";
import { JobSetAsideError } from "./job/errors";

// listMedia is optional: when present, a record whose binaries haven't all arrived yet is
// held back (see mediaReady) — when absent (simple callers/tests), everything counts as here.
export type RawBatchStore = Pick<Store, "listRawMemories"> & Partial<Pick<Store, "listMedia">>;

/** Every media ref a record needs on disk before it can be processed: a Journal batch's
 *  page photos + a package's recordings/photos. */
export function requiredMedia(rm: RawMemory): string[] {
  return [...rm.pages, ...(rm.media ?? [])];
}

/** The phone uploads a record and its media separately, so a sync can land the record
 *  before a large recording has finished arriving (2026-11-18: a 21-min WAV landed 45s
 *  after its record → Patronus failed "audio not found"). Such a record waits — the next
 *  sync pulls the missing media and the queue scan picks it up then. */
async function mediaReadyFilter(store: RawBatchStore): Promise<(rm: RawMemory) => boolean> {
  if (!store.listMedia) return () => true;
  const have = new Set(await store.listMedia());
  return (rm) => {
    const missing = requiredMedia(rm).filter((ref) => !have.has(ref));
    if (missing.length) log.info("raw", "queue.wait-media", { id: rm.id, missing: missing.length });
    return missing.length === 0;
  };
}

/** One Raw Memory ready to show as a Process queue row. */
export interface RawBatchQueueItem {
  id: string;
  pageCount: number;
  /** Set when the batch failed too often and was set aside — the row shows this as its
   *  error and does not run until the owner presses Run (see lib/raw/job). */
  setAside?: string;
}

/** Only `synced` batches are offered — `capturing`/`queued` aren't fully on this device
 *  yet, and `processing`/`done` are already being handled (see RawMemoryStatus; a
 *  `processing` one left by a crash is put back to `synced` on start by recoverInterrupted).
 *  `jobs` (optional) marks set-aside batches. */
export async function listUnprocessedRawBatches(
  store: RawBatchStore,
  jobs?: Pick<JobStore, "read">,
): Promise<RawBatchQueueItem[]> {
  const all: RawMemory[] = await store.listRawMemories();
  const ready = await mediaReadyFilter(store);
  const batches = all
    .filter((rm) => rm.status === "synced" && packageKind(rm) === "journal" && rm.pages.length > 0)
    .filter(ready);
  const out: RawBatchQueueItem[] = [];
  for (const rm of batches) {
    const job = jobs ? await jobs.read(rm.id) : null;
    const item: RawBatchQueueItem = { id: rm.id, pageCount: rm.pages.length };
    if (job?.setAside) item.setAside = new JobSetAsideError(rm.id, job.attempts, job.lastError ?? "unknown").message;
    out.push(item);
  }
  return out;
}

/** One synced form PACKAGE waiting for Patronus (see lib/packages). */
export interface PackageQueueItem {
  id: string;
  title: string;
}

export async function listPackagesToResolve(store: RawBatchStore): Promise<PackageQueueItem[]> {
  const all: RawMemory[] = await store.listRawMemories();
  const ready = await mediaReadyFilter(store);
  return all
    // "processing" too: one left over from a run the app quit in the middle of must not be
    // stuck forever (the queue de-dupes by id, so a live run is never started twice).
    .filter((rm) => (rm.status === "synced" || rm.status === "processing") && packageKind(rm) === "form" && !!rm.markdown)
    .filter(ready)
    .map((rm) => ({ id: rm.id, title: rm.title || "Form" }));
}
