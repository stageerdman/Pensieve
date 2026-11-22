// A Journal batch's processing checkpoint: `jobs/<rawId>.json`, local to this Mac (never
// synced). It survives any crash because every write is atomic, and it is what makes a
// rerun resume instead of start over: which pages the AI already described, how many tries
// were made, and — the commit point — which Memories were fully written.
import type { PageDescription } from "../processRawBatch";
import type { VaultFiles } from "./vaultFiles";
import { log } from "../../logger";

/** Tries a batch gets before it is set aside. A crash mid-run counts as a try, so a batch
 *  that crashes the app every time can't crash it forever. */
export const MAX_ATTEMPTS = 3;

export const INTERRUPTED = "interrupted — the app quit or crashed while this batch was processing";

export interface JobRecord {
  rawId: string;
  /** Tries started so far (bumped and saved BEFORE any work). */
  attempts: number;
  /** AI page descriptions already received, by page ref. */
  pages: Record<string, PageDescription>;
  /** Set only once every Memory's files are on disk — after this, only cleanup remains. */
  written?: string[];
  setAside?: boolean;
  lastError?: string;
}

export const JOBS_DIR = "jobs";
const jobPath = (rawId: string) => `${JOBS_DIR}/${rawId}.json`;

export function newJob(rawId: string): JobRecord {
  return { rawId, attempts: 0, pages: {} };
}

/** The owner pressed Run on a set-aside batch: it gets a full set of tries again. The
 *  page descriptions are kept — they were fine; it was a later step that failed. */
export function released(job: JobRecord): JobRecord {
  return { ...job, attempts: 0, setAside: false };
}

export function withAttempt(job: JobRecord): JobRecord {
  return { ...job, attempts: job.attempts + 1 };
}

export function withPage(job: JobRecord, ref: string, d: PageDescription): JobRecord {
  return { ...job, pages: { ...job.pages, [ref]: d } };
}

export function failed(job: JobRecord, reason: string): JobRecord {
  return { ...job, lastError: reason, setAside: job.attempts >= MAX_ATTEMPTS || undefined };
}

/** Reads/writes job records. A record that won't parse is reported and treated as absent
 *  (a fresh job) — the batch itself is untouched, so the worst case is redoing AI work. */
export function jobStore(files: VaultFiles) {
  return {
    async read(rawId: string): Promise<JobRecord | null> {
      const raw = await files.readText(jobPath(rawId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as JobRecord;
      } catch (e) {
        log.error("raw", "job.parse-error", { rawId, error: String(e) });
        return null;
      }
    },
    write: (job: JobRecord) => files.writeText(jobPath(job.rawId), JSON.stringify(job)),
    remove: (rawId: string) => files.remove(jobPath(rawId)),
    async listIds(): Promise<string[]> {
      const names = await files.list(JOBS_DIR);
      return names.filter((n) => n.endsWith(".json") && !n.startsWith(".")).map((n) => n.slice(0, -5));
    },
  };
}

export type JobStore = ReturnType<typeof jobStore>;
