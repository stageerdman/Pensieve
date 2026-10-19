// The native transcription engine — the real implementation of the `TranscriptionEngine`
// seam. It invokes the Tauri `transcribe_audio` command (which spawns the Python/MLX engine),
// maps the engine's `transcribe-progress` events onto `TranscribeProgress`, and parses the
// returned JSON into our locked `Transcript`. Desktop-only: `isTauri()` gates construction.
//
// The engine stays side-effect-free per the seam contract — it returns the Transcript; the
// caller (the queue hook) owns saveTranscript + reindex + sync.

import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { Transcript } from "./types";
import { parseTranscript } from "./transcript";
import type { TranscriptionEngine, TranscribeOptions, TranscribePhase, ProgressFn } from "./engine";

/** The engine's raw stderr phase → our seam's TranscribePhase. */
function mapPhase(enginePhase: string): TranscribePhase {
  switch (enginePhase) {
    case "load-audio":
      return "decoding";
    case "polish":
      return "polishing";
    case "done":
      return "saving";
    case "transcribe":
    default:
      return "transcribing";
  }
}

interface NativeProgress {
  mediaRef: string;
  phase: string;
  pct: number; // 0..100 from Rust
}

export class NativeTranscriptionEngine implements TranscriptionEngine {
  /** Optional overrides; when omitted the Rust side resolves sensible defaults (the
   *  transcriber venv + the bundled engine script). */
  constructor(
    private readonly pythonPath?: string,
    private readonly enginePath?: string,
    private readonly polish = true,
  ) {}

  async transcribe(ref: string, opts: TranscribeOptions, onProgress?: ProgressFn): Promise<Transcript> {
    let unlisten: UnlistenFn | null = null;
    if (onProgress) {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<NativeProgress>("transcribe-progress", (ev) => {
        const p = ev.payload;
        if (!p || p.mediaRef !== ref) return; // one global channel → filter by ref
        onProgress({ ref, phase: mapPhase(p.phase), pct: Math.max(0, Math.min(1, p.pct / 100)) });
      });
    }
    try {
      const json = await invoke<string>("transcribe_audio", {
        mediaRef: ref,
        model: opts.model,
        pythonPath: this.pythonPath ?? null,
        enginePath: this.enginePath ?? null,
        polish: this.polish,
      });
      const t = parseTranscript(json);
      if (!t) throw new Error("engine returned an unparseable transcript");
      return t;
    } finally {
      if (unlisten) unlisten();
    }
  }

  /** Pause: ask the Rust side to kill the running engine child for `ref`. The in-flight
   *  `transcribe` promise above then rejects with the CANCELLED sentinel; the czech-whisper
   *  checkpoint is left on disk so a later Run resumes mid-file. */
  async cancel(ref: string): Promise<void> {
    await invoke("cancel_transcription", { mediaRef: ref });
  }
}

/** A progress mapper exported for tests. */
export const _mapPhase = mapPhase;
export type { NativeProgress };
