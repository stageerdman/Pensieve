// The transcription engine SEAM — the contract between the UI (queue rows / Transcribe
// button) and whatever actually produces a transcript. Declared now so the UI and core can
// be built and tested against a stable interface; the real implementation lands in a later
// phase (a Tauri command that spawns the Python/MLX engine — Czech Whisper + Parakeet — and
// captures its stdout → the locked `Transcript` shape). Keeping this a narrow interface means
// the UI never knows whether it's talking to a stub, a fake (tests), or the native engine.

import type { Transcript } from "./types";
import type { TranscriptionModel } from "./models";

/** Where the engine is in its pipeline — drives the row's ambient status line. */
export type TranscribePhase =
  | "queued" // waiting behind another run
  | "decoding" // ffmpeg → 16 kHz mono PCM
  | "transcribing" // the model is running (the long part)
  | "polishing" // the optional `claude -p` minimal-edit pass
  | "saving"; // writing the sidecar + reindexing

export interface TranscribeProgress {
  ref: string; // which audio this is about
  phase: TranscribePhase;
  /** 0..1 within the current phase, when the engine can estimate it. */
  pct?: number;
}

export interface TranscribeOptions {
  model: TranscriptionModel;
}

export type ProgressFn = (p: TranscribeProgress) => void;

/** The rejection message a `transcribe(...)` promise carries when the run was cancelled by
 *  the user (Pause) rather than failing. The queue treats this as "paused" — no error icon —
 *  and the engine keeps its checkpoint so a later Run resumes mid-file. Kept in sync with the
 *  Rust `CANCELLED` sentinel. */
export const CANCELLED = "__cancelled__";

/** True if a thrown value is the cancellation sentinel (message match, string or Error). */
export function isCancelled(e: unknown): boolean {
  const msg = typeof e === "string" ? e : (e as Error)?.message ?? String(e);
  return msg.includes(CANCELLED);
}

/** Produce a transcript for one audio ref. Rejects on failure (the caller shows Retry).
 *  Implementations MUST save nothing themselves beyond returning the Transcript — the
 *  caller owns `saveTranscript` + reindex, so the engine stays side-effect-free and the
 *  save path is identical for stub, fake, and native. */
export interface TranscriptionEngine {
  transcribe(ref: string, opts: TranscribeOptions, onProgress?: ProgressFn): Promise<Transcript>;
  /** Stop the in-flight run for `ref` (Pause). Optional — a stub/fake needn't implement it.
   *  The running `transcribe` promise then rejects with `CANCELLED`; any checkpoint is kept. */
  cancel?(ref: string): Promise<void>;
}
