// The specific ways a processing job stops — so callers (and the log) can tell a refused
// double run from a real failure from a batch that has been set aside.

export class JobAlreadyRunningError extends Error {
  constructor(readonly rawId: string) {
    super(`batch ${rawId} is already being processed`);
    this.name = "JobAlreadyRunningError";
  }
}

export class JobFailedError extends Error {
  constructor(readonly rawId: string, readonly attempt: number, readonly reason: string) {
    super(`batch ${rawId} failed (try ${attempt}): ${reason}`);
    this.name = "JobFailedError";
  }
}

/** The batch failed too many times in a row; it is left untouched (still unprocessed, its
 *  snapshot kept) and will not run again until the owner presses Run on it. */
export class JobSetAsideError extends Error {
  constructor(readonly rawId: string, readonly attempts: number, readonly reason: string) {
    super(`Set aside after ${attempts} failed tries — press Run to try again. Last error: ${reason}`);
    this.name = "JobSetAsideError";
  }
}

export function reasonOf(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 800);
}
