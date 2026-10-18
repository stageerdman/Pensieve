// Pure mapping from a queue row's runtime state → what its ambient status line should say
// and how it should read (tone + whether the dot pulses). Shared by the prototype and the
// real drawer component so the calm "state is the signal" language (design.md) is defined
// ONCE, not re-typed per surface. No DOM, no React.

import type { TranscribePhase } from "./engine";

export type RowState = "idle" | "queued" | "transcribing" | "done" | "error";

/** Tone drives the dot/text colour — never a whole-row tint. Mirrors the kit's state hues. */
export type RowTone = "muted" | "accent" | "gold" | "success" | "danger";

export interface RowStatus {
  /** Short status text, or null when the row shows its Transcribe button instead (idle). */
  text: string | null;
  tone: RowTone;
  /** Show the status dot at all (idle shows a button, not a status line). */
  showDot: boolean;
  /** Dot pulses only for the single, actively-running row — so one pulse = one live job. */
  pulse: boolean;
}

function pct(p?: number): string {
  return p === undefined ? "" : ` ${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}

/** The status for a row. `phase` is only consulted while `state === "transcribing"`. */
export function rowStatus(state: RowState, phase?: TranscribePhase, progress?: number): RowStatus {
  switch (state) {
    case "idle":
      return { text: null, tone: "muted", showDot: false, pulse: false };
    case "queued":
      return { text: "Queued", tone: "muted", showDot: true, pulse: false };
    case "transcribing":
      // The polish pass is the one gold ("saving-like") phase; everything else is accent.
      if (phase === "polishing") return { text: "Polishing…", tone: "gold", showDot: true, pulse: true };
      if (phase === "saving") return { text: "Saving…", tone: "gold", showDot: true, pulse: true };
      if (phase === "decoding") return { text: "Preparing…", tone: "accent", showDot: true, pulse: true };
      return { text: `Transcribing…${pct(progress)}`, tone: "accent", showDot: true, pulse: true };
    case "done":
      return { text: "✓ Transcribed", tone: "success", showDot: true, pulse: false };
    case "error":
      return { text: "Couldn't transcribe", tone: "danger", showDot: true, pulse: false };
  }
}
