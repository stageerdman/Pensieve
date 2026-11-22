// Test-only: one realistic Journal batch, the "app start" sequence, and the checker the
// kill tests share. The batch has 4 pages over 2 dates with a shared boundary page — the
// split that is easiest to get wrong — and 2 batches so a crash in one can't leak into the
// other.
import type { RawMemory } from "../../../types";
import type { PageDescription } from "../../processRawBatch";
import { listUnprocessedRawBatches } from "../../queue";
import { recoverInterrupted } from "../recover";
import { jobStore } from "../jobRecord";
import { runJournalJob, type JournalJobDeps } from "../runJournalJob";
import { JobFailedError, JobSetAsideError } from "../errors";
import type { VaultFiles } from "../vaultFiles";
import { vaultStore } from "./vaultStore";

export const BATCH_IDS = ["r1", "r2"];

const pagesOf = (id: string) => ["a", "b", "c", "d"].map((p) => `media/${id}/${p}.jpg`);

/** Put the two synced batches (records + page photos) on the disk. */
export async function seedBatches(files: VaultFiles): Promise<void> {
  for (const id of BATCH_IDS) {
    for (const ref of pagesOf(id)) await files.writeText(ref, `photo bytes of ${ref}`);
    const rm: RawMemory = { id, status: "synced", createdAt: 1, updatedAt: 1, pages: pagesOf(id) };
    await files.writeText(`raw/${id}.json`, JSON.stringify(rm));
  }
}

/** The fake AI: deterministic per page. a = Nov 3, b continues, c shares the boundary and
 *  opens Nov 4, d continues. */
export async function describePage(ref: string): Promise<PageDescription> {
  const page = ref.slice(ref.lastIndexOf("/") + 1, ref.lastIndexOf("."));
  const text = `handwriting on ${ref}`;
  if (page === "a") return { transcript: text, dateHeader: "3 November 2026", title: `Title ${ref}` };
  if (page === "c") return { transcript: text, dateHeader: "4 November 2026", continuesPrevious: true, previousPart: `tail of ${ref}`, title: `Title ${ref}` };
  return { transcript: text, dateHeader: null };
}

export function jobDeps(files: VaultFiles, describe = describePage): JournalJobDeps {
  return {
    raws: vaultStore(files),
    files,
    batch: {
      store: vaultStore(files),
      copyMedia: (from, to) => files.copyFile(from, to),
      resolveAbsolutePath: async (ref) => `/vault/${ref}`,
      describePage: describe,
      now: () => new Date(2026, 10, 22),
    },
  };
}

/** What one app start does: recover, scan, run every offered batch in order — except
 *  set-aside ones, which the queue shows as error rows until the owner presses Run. A
 *  batch failing (not a kill) doesn't stop the others, just like the real queue. */
export async function appStart(files: VaultFiles, describe = describePage): Promise<void> {
  const deps = jobDeps(files, describe);
  await recoverInterrupted({ raws: vaultStore(files), files });
  const offered = await listUnprocessedRawBatches(vaultStore(files), jobStore(files));
  for (const item of offered.filter((i) => !i.setAside)) {
    await runJournalJob(item.id, deps).catch((e: unknown) => {
      if (e instanceof JobFailedError || e instanceof JobSetAsideError) return;
      throw e;
    });
  }
}

const VOLATILE = new Set(["updatedAt", "transcribedAt"]);

/** The disk's user-visible outputs, with timestamps stripped and temp files ignored —
 *  equal between two runs iff they produced the same Memories, byte for byte. */
export function outputsOf(disk: Map<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of [...disk.entries()].sort()) {
    if (!/^(notes|media)\//.test(path) || path.split("/").pop()!.startsWith(".")) continue;
    out[path] = path.endsWith(".json") ? JSON.parse(value, (k, v) => (VOLATILE.has(k) ? undefined : v)) : value;
  }
  return out;
}

/** Every rule a finished run must satisfy. Returns the broken ones (empty = all good). */
export function problemsIn(disk: Map<string, string>, expectedOutputs: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const paths = [...disk.keys()];
  const actual = outputsOf(disk);
  if (JSON.stringify(actual) !== JSON.stringify(expectedOutputs)) {
    const extra = Object.keys(actual).filter((k) => !(k in expectedOutputs));
    const missing = Object.keys(expectedOutputs).filter((k) => !(k in actual));
    const differ = Object.keys(actual).filter((k) => k in expectedOutputs && JSON.stringify(actual[k]) !== JSON.stringify(expectedOutputs[k]));
    problems.push(`outputs differ — extra: ${extra.join(", ")} · missing: ${missing.join(", ")} · changed: ${differ.join(", ")}`);
  }
  for (const id of BATCH_IDS) {
    if (paths.includes(`raw/${id}.json`)) problems.push(`raw/${id}.json still there (not done)`);
    if (paths.some((p) => p.startsWith(`media/${id}/`))) problems.push(`media/${id}/ still there`);
    if (!paths.includes(`snapshots/raw/${id}/record.json`)) problems.push(`no snapshot record for ${id}`);
    for (const ref of pagesOf(id)) {
      const snap = disk.get(`snapshots/raw/${id}/${ref.split("/").pop()}`);
      if (snap !== `photo bytes of ${ref}`) problems.push(`snapshot photo wrong for ${ref}`);
    }
  }
  if (paths.some((p) => p.startsWith("jobs/") && !p.split("/").pop()!.startsWith("."))) problems.push("job records left behind");
  return problems;
}
