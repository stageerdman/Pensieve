// Crash-safe processing of Journal batches — see runJournalJob.ts for the step order.
export { runJournalJob, type JournalJobDeps, type JournalJobResult } from "./runJournalJob";
export { recoverInterrupted } from "./recover";
export { ensureSnapshot, restoreSnapshot } from "./snapshot";
export { jobStore, MAX_ATTEMPTS, type JobRecord } from "./jobRecord";
export { JobAlreadyRunningError, JobFailedError, JobSetAsideError } from "./errors";
export type { VaultFiles } from "./vaultFiles";
