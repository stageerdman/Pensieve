// Run once on every app start, before the Process queue scans: anything the last run was
// in the middle of goes back to "ready", so nothing is ever stuck.
//   · A raw record left "processing" → "synced" (the desktop's "ready to process" state;
//     "queued" in this app means "still uploading from the phone"). Its job already reads
//     "interrupted" and that try still counts, so a batch that crashes the app can't loop.
//   · A job whose Memories were written but whose raw record is already gone (crashed
//     during cleanup) → leftover photos and the job record are removed.
import type { Store } from "../../types";
import { jobStore } from "./jobRecord";
import type { VaultFiles } from "./vaultFiles";
import { log } from "../../logger";

export interface RecoverDeps {
  raws: Pick<Store, "listRawMemories" | "saveRawMemory" | "removeRawMemory">;
  files: VaultFiles;
}

export async function recoverInterrupted(deps: RecoverDeps): Promise<{ requeued: string[]; cleaned: string[] }> {
  const jobs = jobStore(deps.files);
  const all = await deps.raws.listRawMemories();
  const requeued: string[] = [];
  for (const rm of all.filter((r) => r.status === "processing")) {
    const job = await jobs.read(rm.id); // its lastError already says INTERRUPTED (withAttempt)
    await deps.raws.saveRawMemory({ ...rm, status: "synced" });
    requeued.push(rm.id);
    log.warn("raw", "recover.requeued", { rawId: rm.id, kind: rm.kind ?? "journal", attempts: job?.attempts ?? 0 });
  }

  const present = new Set(all.map((r) => r.id));
  const cleaned: string[] = [];
  for (const id of await jobs.listIds()) {
    if (present.has(id)) continue;
    const job = await jobs.read(id);
    if (!job?.written) {
      // Batch gone without finishing (deleted on the phone?) — keep the checkpoint, say so.
      log.warn("raw", "recover.orphan-job", { rawId: id });
      continue;
    }
    // Finish the interrupted cleanup: the record may be gone but its photos still there.
    await deps.raws.removeRawMemory(id);
    await jobs.remove(id);
    cleaned.push(id);
  }
  log.info("raw", "recover.done", { requeued: requeued.length, cleaned: cleaned.length });
  return { requeued, cleaned };
}
