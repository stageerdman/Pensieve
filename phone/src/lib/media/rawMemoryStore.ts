// rawMemoryStore.ts — the phone's Raw Memory index: small metadata (id/status/ordered
// page refs) in localStorage, mirroring vaultStore.ts's shape exactly (notes are small
// text; Raw Memory records are small too — the page BYTES are the large payload and
// already live in IndexedDB via mediaStore.ts, reused unchanged here). Deliberately a
// SEPARATE list from the note vault — a Raw Memory is not a Note (see
// updates/2026-11-09 RAW-MEMORY-JOURNAL/wiki.md: no title, no category, not searchable,
// mutable/deletable right up until desktop processing consumes it).

import { newId } from "../../vaultStore";
import { mintMediaRef, registerLocalMedia, deleteMedia } from "./mediaStore";

export type RawMemoryStatus = "capturing" | "queued" | "synced" | "processing" | "done";

export interface RawMemory {
  id: string;
  status: RawMemoryStatus;
  createdAt: number;
  pages: string[]; // ordered media refs — media/<id>/<mediaId>.<ext>
}

const RAW_KEY = "pensieve.phone.raw";

export function loadRawBatches(): RawMemory[] {
  try {
    const raw = localStorage.getItem(RAW_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.every((r) => r && typeof r.id === "string" && Array.isArray(r.pages))) {
      return v as RawMemory[];
    }
  } catch {
    /* corrupt — treat as empty rather than crash */
  }
  return [];
}

export function persistRawBatches(data: RawMemory[]): void {
  try {
    localStorage.setItem(RAW_KEY, JSON.stringify(data));
  } catch {
    /* quota / unavailable — a reload just starts from whatever was last saved */
  }
}

/** Start a new batch — mints the id, writes nothing else yet (the first captured page
 *  is a separate addPageToBatch call, so the capture screen can show "0 pages" briefly
 *  before the first shutter tap without this record being half-written). */
export function createRawBatch(): RawMemory {
  return { id: newId(), status: "capturing", createdAt: Date.now(), pages: [] };
}

/** Save a freshly-captured page's bytes and return the batch with it appended. Pure
 *  w.r.t. the batch object (returns a new one); the byte write is the one real side
 *  effect, via the SAME mediaStore every other capture spell already uses. */
export function addPageToBatch(batch: RawMemory, blob: Blob, filename = "page.jpg"): RawMemory {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  const ref = mintMediaRef(batch.id, file);
  registerLocalMedia(ref, blob);
  return { ...batch, pages: [...batch.pages, ref] };
}

/** Remove one page — frees its bytes too (a Raw Memory's pages aren't shared with
 *  anything else yet; sharing only happens AFTER desktop processing, see
 *  processRawBatch.ts's duplication, which copies bytes rather than referencing these). */
export async function removePageFromBatch(batch: RawMemory, index: number): Promise<RawMemory> {
  const ref = batch.pages[index];
  if (ref) await deleteMedia(ref);
  return { ...batch, pages: batch.pages.filter((_, i) => i !== index) };
}

export function reorderBatchPages(batch: RawMemory, from: number, to: number): RawMemory {
  const pages = [...batch.pages];
  const [moved] = pages.splice(from, 1);
  pages.splice(to, 0, moved);
  return { ...batch, pages };
}

/** Delete a whole batch — every page's bytes, then the record. The caller still owns
 *  removing it from whatever list is driving the UI (mirrors deleteMedia's "just the
 *  bytes" contract; this is the batch-level equivalent). */
export async function deleteRawBatch(batch: RawMemory): Promise<void> {
  for (const ref of batch.pages) await deleteMedia(ref);
}
