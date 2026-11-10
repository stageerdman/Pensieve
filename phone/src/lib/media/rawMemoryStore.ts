// rawMemoryStore.ts — the phone's Raw Memory index: small metadata (id/status/ordered
// page refs) in localStorage, mirroring vaultStore.ts's shape exactly (notes are small
// text; Raw Memory records are small too — the page BYTES are the large payload and
// already live in IndexedDB via mediaStore.ts, reused unchanged here). Deliberately a
// SEPARATE list from the note vault — a Raw Memory is not a Note (see
// updates/2026-11-09 RAW-MEMORY-JOURNAL/wiki.md: no title, no category, not searchable,
// mutable/deletable right up until desktop processing consumes it).
//
// One localStorage key PER BATCH (`RAW_PREFIX + id`), not one big array — this mirrors
// the desktop vault's one-file-per-record (`raw/<id>.json`) exactly, which the sync
// engine's LocalVault contract depends on (list/read/write/delete by id independently,
// same as notes). `updatedAt` is stamped on every mutation so sync can tell a local
// edit from a stale copy, the same way a note's `updatedAt` already drives that.

import { newId } from "../../vaultStore";
import { mintMediaRef, registerLocalMedia, deleteMedia } from "./mediaStore";

export type RawMemoryStatus = "capturing" | "queued" | "synced" | "processing" | "done";

export interface RawMemory {
  id: string;
  status: RawMemoryStatus;
  createdAt: number;
  // Optional for back-compat with the handful of hand-built test fixtures that predate
  // sync — every real mutation below always stamps it. Sync treats a missing value as
  // "older than anything", never as a reason to throw.
  updatedAt?: number;
  pages: string[]; // ordered media refs — media/<id>/<mediaId>.<ext>
}

const RAW_PREFIX = "pensieve.phone.raw.";

function isRawMemory(v: unknown): v is RawMemory {
  const r = v as Partial<RawMemory> | null;
  return !!r && typeof r.id === "string" && Array.isArray(r.pages);
}

function rawKeysInStorage(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(RAW_PREFIX)) keys.push(k);
  }
  return keys;
}

export function loadRawBatches(): RawMemory[] {
  const out: RawMemory[] = [];
  for (const key of rawKeysInStorage()) {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "");
      if (isRawMemory(v)) out.push(v);
    } catch {
      /* corrupt entry — skip it, don't let it take the whole list down */
    }
  }
  return out;
}

/** One batch by id — the shape the sync engine's LocalVault needs (read/write
 *  independently, same as a single note), distinct from loadRawBatches' "everything"
 *  view the Home strip renders from. */
export function loadRawBatch(id: string): RawMemory | null {
  try {
    const raw = localStorage.getItem(RAW_PREFIX + id);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return isRawMemory(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveRawBatch(b: RawMemory): void {
  try {
    localStorage.setItem(RAW_PREFIX + b.id, JSON.stringify(b));
  } catch {
    /* quota / unavailable — a reload just starts from whatever was last saved */
  }
}

export function deleteRawBatchRecord(id: string): void {
  localStorage.removeItem(RAW_PREFIX + id);
}

/** Overwrite the WHOLE authoritative set — used by the UI layer, which always holds
 *  the full list in React state. Internally this is still one key per batch; any
 *  batch id present in storage but absent from `data` is removed (an id that's gone
 *  from the authoritative list no longer exists, same as the old single-array
 *  semantics this replaces). */
export function persistRawBatches(data: RawMemory[]): void {
  const keep = new Set(data.map((b) => RAW_PREFIX + b.id));
  for (const key of rawKeysInStorage()) {
    if (!keep.has(key)) localStorage.removeItem(key);
  }
  for (const b of data) saveRawBatch(b);
}

/** Start a new batch — mints the id, writes nothing else yet (the first captured page
 *  is a separate addPageToBatch call, so the capture screen can show "0 pages" briefly
 *  before the first shutter tap without this record being half-written). */
export function createRawBatch(): RawMemory {
  const now = Date.now();
  return { id: newId(), status: "capturing", createdAt: now, updatedAt: now, pages: [] };
}

/** Save a freshly-captured page's bytes and return the batch with it appended. Pure
 *  w.r.t. the batch object (returns a new one); the byte write is the one real side
 *  effect, via the SAME mediaStore every other capture spell already uses. */
export function addPageToBatch(batch: RawMemory, blob: Blob, filename = "page.jpg"): RawMemory {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  const ref = mintMediaRef(batch.id, file);
  registerLocalMedia(ref, blob);
  return { ...batch, pages: [...batch.pages, ref], updatedAt: Date.now() };
}

/** Remove one page — frees its bytes too (a Raw Memory's pages aren't shared with
 *  anything else yet; sharing only happens AFTER desktop processing, see
 *  processRawBatch.ts's duplication, which copies bytes rather than referencing these). */
export async function removePageFromBatch(batch: RawMemory, index: number): Promise<RawMemory> {
  const ref = batch.pages[index];
  if (ref) await deleteMedia(ref);
  return { ...batch, pages: batch.pages.filter((_, i) => i !== index), updatedAt: Date.now() };
}

export function reorderBatchPages(batch: RawMemory, from: number, to: number): RawMemory {
  const pages = [...batch.pages];
  const [moved] = pages.splice(from, 1);
  pages.splice(to, 0, moved);
  return { ...batch, pages, updatedAt: Date.now() };
}

/** Delete a whole batch — every page's bytes, then the record. The caller still owns
 *  removing it from whatever list is driving the UI (mirrors deleteMedia's "just the
 *  bytes" contract; this is the batch-level equivalent). */
export async function deleteRawBatch(batch: RawMemory): Promise<void> {
  for (const ref of batch.pages) await deleteMedia(ref);
}
