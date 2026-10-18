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

/** Produce a transcript for one audio ref. Rejects on failure (the caller shows Retry).
 *  Implementations MUST save nothing themselves beyond returning the Transcript — the
 *  caller owns `saveTranscript` + reindex, so the engine stays side-effect-free and the
 *  save path is identical for stub, fake, and native. */
export interface TranscriptionEngine {
  transcribe(ref: string, opts: TranscribeOptions, onProgress?: ProgressFn): Promise<Transcript>;
}
