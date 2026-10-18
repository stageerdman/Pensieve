// The transcription model catalog — the TWO models Pensieve offers, and the choice rule.
// Single source of truth shared by the Transcribe UI (the model-choice prompt), the queue,
// and the native engine. Pure data + pure helpers; no I/O, no UI.
//
// Ground truth (ported from /dev/transcriber, 2026-10-18):
//  · "czech-whisper" = mikr/whisper-large-v3-czech-cv13 → Apple-MLX fp16, via mlx-whisper +
//    Silero-VAD chunking. Best Czech quality and the safe pick for anything complicated/noisy.
//    Slower. THE DEFAULT (and what automatic transcription always uses).
//  · "parakeet" = mlx-community/parakeet-tdt-0.6b-v3, via parakeet-mlx. NVIDIA TDT (not an
//    encoder-decoder), multilingual + auto-detecting, ~60× realtime, essentially never
//    hallucinates. Surfaced to the owner as the "simple English" / fast choice.
// The owner's mental model is deliberately simple ("simple English" vs "complicated / Czech");
// we do NOT expose that Parakeet is technically multilingual.

export type TranscriptionModel = "czech-whisper" | "parakeet";

/** The default model: automatic transcription always uses it, and it's the safe pick in the
 *  manual choice. */
export const DEFAULT_MODEL: TranscriptionModel = "czech-whisper";

export interface ModelInfo {
  id: TranscriptionModel;
  /** The native model identifier the engine loads (HF repo / converted MLX dir). */
  backendId: string;
  /** Short label for the choice UI. */
  label: string;
  /** One-line plain-language tradeoff hint (speed vs Czech accuracy) — no jargon. */
  hint: string;
  /** True for the default/safe option, so the UI can mark the path of least resistance. */
  isDefault: boolean;
}

export const MODELS: Record<TranscriptionModel, ModelInfo> = {
  "czech-whisper": {
    id: "czech-whisper",
    backendId: "mikr/whisper-large-v3-czech-cv13",
    label: "Complicated / Czech",
    hint: "Best for Czech or anything tricky. A little slower.",
    isDefault: true,
  },
  parakeet: {
    id: "parakeet",
    backendId: "mlx-community/parakeet-tdt-0.6b-v3",
    label: "Simple English",
    hint: "Fast, for clear English speech.",
    isDefault: false,
  },
};

/** The two choices in display order — default first (path of least resistance). */
export function modelChoices(): ModelInfo[] {
  return [MODELS[DEFAULT_MODEL], ...Object.values(MODELS).filter((m) => m.id !== DEFAULT_MODEL)];
}

/** Narrow an arbitrary string to a known model id, falling back to the default. */
export function coerceModel(id: string | null | undefined): TranscriptionModel {
  return id === "parakeet" || id === "czech-whisper" ? id : DEFAULT_MODEL;
}
