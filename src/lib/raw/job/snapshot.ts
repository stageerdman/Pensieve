// A copy of a raw batch taken BEFORE processing touches it: `snapshots/raw/<rawId>/`
// holds `record.json` (the batch as it was) and every page photo. Finishing a batch deletes
// the raw record and its photos, so this copy is what makes any batch restorable.
// Kept after success on purpose (rollback must stay possible); pruning is a later decision.
import type { RawMemory, Store } from "../../types";
import type { VaultFiles } from "./vaultFiles";
import { log } from "../../logger";

const dirOf = (rawId: string) => `snapshots/raw/${rawId}`;
const recordOf = (rawId: string) => `${dirOf(rawId)}/record.json`;
const fileName = (ref: string) => ref.slice(ref.lastIndexOf("/") + 1);

/** Snapshot the batch once. The record is written LAST, so its presence means the photos
 *  are all there; an interrupted snapshot is simply taken again. A batch whose snapshot
 *  exists is never re-snapshotted (that would copy a later state over the original). */
export async function ensureSnapshot(files: VaultFiles, rm: RawMemory): Promise<void> {
  if ((await files.readText(recordOf(rm.id))) !== null) return;
  for (const ref of rm.pages) await files.copyFile(ref, `${dirOf(rm.id)}/${fileName(ref)}`);
  await files.writeText(recordOf(rm.id), JSON.stringify(rm));
  log.info("raw", "job.snapshot", { rawId: rm.id, pages: rm.pages.length });
}

/** Put the batch back exactly as it was snapshotted — photos to media/<id>/, the record to
 *  raw/<id>.json — so it shows up as unprocessed again. Returns null if there's no snapshot. */
export async function restoreSnapshot(
  files: VaultFiles,
  raws: Pick<Store, "saveRawMemory">,
  rawId: string,
): Promise<RawMemory | null> {
  const raw = await files.readText(recordOf(rawId));
  if (raw === null) return null;
  const rm: RawMemory = { ...(JSON.parse(raw) as RawMemory), status: "synced" };
  for (const ref of rm.pages) await files.copyFile(`${dirOf(rawId)}/${fileName(ref)}`, ref);
  await raws.saveRawMemory(rm); // through the store: re-stamped, so sync sees it as new
  log.warn("raw", "job.snapshot.restored", { rawId, pages: rm.pages.length });
  return rm;
}
