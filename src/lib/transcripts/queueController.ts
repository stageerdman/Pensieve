// The transcribe-queue state machine — PURE and framework-free, so the exact
// "one-at-a-time with pause / hold / resume" rules the owner specified are provable in
// isolation and shared by the React hook (and the prototype's logic). No engine, no React,
// no I/O: given the jobs, it answers "what transitions are legal" and "which single job may
// run next". The hook drives the engine off `nextToStart`.

import type { TranscriptionModel } from "./models";
import type { TranscribePhase } from "./engine";

export type JobState =
  | "idle" // listed, not yet asked to transcribe
  | "queued" // will run when the single slot frees
  | "held" // queued but user-paused — skipped until resumed
  | "running" // the one active job, progressing
  | "paused" // the active job, user-paused (the slot stays occupied)
  | "error" // failed; retryable
  | "done"; // finished (about to leave the list)

export interface Job {
  ref: string;
  state: JobState;
  model: TranscriptionModel | null;
  pct: number;
  phase: TranscribePhase | null;
}

export function makeJob(ref: string): Job {
  return { ref, state: "idle", model: null, pct: 0, phase: null };
}

// Immutable patch of one job by ref.
function patch(jobs: Job[], ref: string, fields: Partial<Job>): Job[] {
  return jobs.map((j) => (j.ref === ref ? { ...j, ...fields } : j));
}

// ── transitions (each returns a new array) ──────────────────────────────────
/** Ask a job to transcribe with `model` → it enters the queue at 0%. */
export function enqueue(jobs: Job[], ref: string, model: TranscriptionModel): Job[] {
  return patch(jobs, ref, { state: "queued", model, pct: 0, phase: null });
}

/** Enqueue every currently-idle job under one model (the "Transcribe all" batch). */
export function enqueueAll(jobs: Job[], model: TranscriptionModel): Job[] {
  return jobs.map((j) => (j.state === "idle" ? { ...j, state: "queued", model, pct: 0, phase: null } : j));
}

/** The ⏸ action: a waiting job is held; the running job is paused (keeps the slot). */
export function hold(jobs: Job[], ref: string): Job[] {
  const j = jobs.find((x) => x.ref === ref);
  if (!j) return jobs;
  if (j.state === "queued") return patch(jobs, ref, { state: "held" });
  if (j.state === "running") return patch(jobs, ref, { state: "paused" });
  return jobs;
}

/** The ▶ action: a held job rejoins the queue; a paused job resumes running. */
export function resume(jobs: Job[], ref: string): Job[] {
  const j = jobs.find((x) => x.ref === ref);
  if (!j) return jobs;
  if (j.state === "held") return patch(jobs, ref, { state: "queued" });
  if (j.state === "paused") return patch(jobs, ref, { state: "running" });
  return jobs;
}

/** Retry a failed job → back to the queue (keeps its chosen model). */
export function retry(jobs: Job[], ref: string): Job[] {
  const j = jobs.find((x) => x.ref === ref);
  if (!j || j.state !== "error") return jobs;
  return patch(jobs, ref, { state: "queued", pct: 0, phase: null });
}

/** Mark the active job as running (used when the slot is handed to `nextToStart`). */
export function start(jobs: Job[], ref: string): Job[] {
  return patch(jobs, ref, { state: "running" });
}

export function setProgress(jobs: Job[], ref: string, pct: number, phase: TranscribePhase | null = null): Job[] {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return patch(jobs, ref, { pct: clamped, phase });
}

export function markError(jobs: Job[], ref: string): Job[] {
  return patch(jobs, ref, { state: "error", phase: null });
}

export function markDone(jobs: Job[], ref: string): Job[] {
  return patch(jobs, ref, { state: "done", pct: 100, phase: null });
}

/** Drop finished jobs (after their leave animation). */
export function removeDone(jobs: Job[]): Job[] {
  return jobs.filter((j) => j.state !== "done");
}

// ── selectors ───────────────────────────────────────────────────────────────
/** The job occupying the single slot (running OR paused), or null. */
export function activeRef(jobs: Job[]): string | null {
  return jobs.find((j) => j.state === "running" || j.state === "paused")?.ref ?? null;
}

/** The single job that should START now: null if the slot is occupied (something is
 *  running or paused), otherwise the first queued (never a held) job. This is the whole
 *  "one at a time" rule — the hook calls the engine exactly for this ref. */
export function nextToStart(jobs: Job[]): string | null {
  if (activeRef(jobs) !== null) return null;
  return jobs.find((j) => j.state === "queued")?.ref ?? null;
}

/** Count of jobs somewhere in the pipeline (queued/held/running/paused) — for the header. */
export function inFlightCount(jobs: Job[]): number {
  return jobs.filter((j) => ["queued", "held", "running", "paused"].includes(j.state)).length;
}
