// Runs one Journal batch so that a crash at ANY point is safe (see update CRASH-SAFE-
// PROCESSING). The order is the whole design — each step is atomic and survives a restart:
//   guard → job.attempts+1 → snapshot → status "processing" → describe pages (each one
//   checkpointed) → write Memories (fixed ids, .md last) → job.written (commit point) →
//   remove raw record → remove job.
// A rerun after a crash before the commit point resumes from the checkpoint and overwrites
// the same files; after it, it only finishes the cleanup. So each batch is done exactly once.
import type { RawMemory, Store } from "../../types";
import { processRawBatch, type ProcessRawBatchDeps } from "../processRawBatch";
import { jobStore, failed, newJob, released, withAttempt, withPage, MAX_ATTEMPTS, type JobRecord, type JobStore } from "./jobRecord";
import { ensureSnapshot } from "./snapshot";
import { JobAlreadyRunningError, JobFailedError, JobSetAsideError, reasonOf } from "./errors";
import type { VaultFiles } from "./vaultFiles";
import { log } from "../../logger";

export interface JournalJobDeps {
  raws: Pick<Store, "loadRawMemory" | "saveRawMemory" | "removeRawMemory">;
  files: VaultFiles;
  batch: Omit<ProcessRawBatchDeps, "known" | "onPageDescribed">;
}

export interface JournalJobResult {
  createdNoteIds: string[];
}

// One run per batch at a time in this app — a second request while one runs is refused.
const running = new Set<string>();

/** Process one batch crash-safely. Called for a batch the queue offers (never a set-aside
 *  one — the queue shows those as error rows); calling it on a set-aside batch means the
 *  owner pressed Run on it, which releases it for a fresh set of tries. */
export async function runJournalJob(rawId: string, deps: JournalJobDeps): Promise<JournalJobResult> {
  if (running.has(rawId)) throw new JobAlreadyRunningError(rawId);
  running.add(rawId);
  try {
    return await runGuarded(rawId, deps);
  } finally {
    running.delete(rawId);
  }
}

async function runGuarded(rawId: string, deps: JournalJobDeps): Promise<JournalJobResult> {
  const jobs = jobStore(deps.files);
  const found = await jobs.read(rawId);
  if (found?.written) return finish(rawId, found.written, deps, jobs); // crashed during cleanup

  const rm = await deps.raws.loadRawMemory(rawId);
  if (!rm) throw new JobFailedError(rawId, found?.attempts ?? 0, "raw batch no longer exists");

  let job = found?.setAside ? released(found) : (found ?? newJob(rawId));
  if (found?.setAside) log.info("raw", "job.released", { rawId, lastError: found.lastError });
  if (job.attempts >= MAX_ATTEMPTS) return setAside(rm, job, deps, jobs);
  job = withAttempt(job);
  await jobs.write(job);
  log.info("raw", "job.start", { rawId, attempt: job.attempts, pagesKnown: Object.keys(job.pages).length });

  try {
    await ensureSnapshot(deps.files, rm);
    await deps.raws.saveRawMemory({ ...rm, status: "processing" });
    const result = await processRawBatch(rm, {
      ...deps.batch,
      known: job.pages,
      onPageDescribed: async (ref, d) => {
        job = withPage(job, ref, d);
        await jobs.write(job);
      },
    });
    job = { ...job, written: result.createdNoteIds };
    await jobs.write(job); // the commit point: every Memory is fully on disk
    log.info("raw", "job.written", { rawId, attempt: job.attempts, notes: result.createdNoteIds });
  } catch (e) {
    throw await recordFailure(rm, job, e, deps, jobs);
  }
  return finish(rawId, job.written!, deps, jobs);
}

async function finish(rawId: string, noteIds: string[], deps: JournalJobDeps, jobs: JobStore): Promise<JournalJobResult> {
  await deps.raws.removeRawMemory(rawId);
  await jobs.remove(rawId);
  log.info("raw", "job.done", { rawId, notes: noteIds.length });
  return { createdNoteIds: noteIds };
}

/** Put the batch back to "synced" (unprocessed, retryable) and say why it stopped. */
async function recordFailure(rm: RawMemory, job: JobRecord, e: unknown, deps: JournalJobDeps, jobs: JobStore): Promise<Error> {
  const reason = reasonOf(e);
  const next = failed(job, reason);
  await jobs.write(next);
  await deps.raws.saveRawMemory({ ...rm, status: "synced" });
  log.error("raw", next.setAside ? "job.set-aside" : "job.failed", { rawId: rm.id, attempt: next.attempts, error: reason });
  return next.setAside ? new JobSetAsideError(rm.id, next.attempts, reason) : new JobFailedError(rm.id, next.attempts, reason);
}

/** Out of tries (e.g. it crashed the app every time): stop without touching the batch. */
async function setAside(rm: RawMemory, job: JobRecord, deps: JournalJobDeps, jobs: JobStore): Promise<never> {
  const reason = job.lastError ?? "unknown";
  await jobs.write({ ...job, setAside: true });
  if (rm.status !== "synced") await deps.raws.saveRawMemory({ ...rm, status: "synced" });
  log.error("raw", "job.set-aside", { rawId: rm.id, attempts: job.attempts, error: reason });
  throw new JobSetAsideError(rm.id, job.attempts, reason);
}
