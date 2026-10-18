// cleanEngineError pulls the human-readable failure reason out of a raw transcribe
// rejection (Rust's "engine exited with <status>: <stderr tail>", where the tail
// interleaves JSON progress lines and tqdm bars with the real Python exception).
import { describe, it, expect } from "vitest";
import { cleanEngineError } from "./useProcessQueue";

describe("cleanEngineError", () => {
  it("keeps the real exception, dropping JSON progress + tqdm noise", () => {
    const raw = [
      "engine exited with exit status: 1:",
      '{"phase": "load-audio", "pct": 2}',
      '{"phase": "transcribe", "pct": 12.0}',
      "  0%|          | 0/78 [00:00<?, ?frames/s]",
      "Traceback (most recent call last):",
      '  File "pensieve_transcribe.py", line 95, in transcribe_whisper',
      "RuntimeError: Czech MLX model missing at /Users/x/.cache/...",
    ].join("\n");
    const out = cleanEngineError(raw);
    expect(out).toContain("RuntimeError: Czech MLX model missing");
    expect(out).not.toContain('{"phase"');
    expect(out).not.toContain("frames/s");
  });

  it("falls back to the raw string when nothing survives filtering", () => {
    expect(cleanEngineError("spawn failed: No such file or directory")).toBe(
      "spawn failed: No such file or directory",
    );
  });

  it("handles an Error object and empties gracefully", () => {
    expect(cleanEngineError(new Error("boom"))).toBe("boom");
    expect(cleanEngineError("")).toBe("Transcription failed (no error detail)");
  });

  it("caps the length so a giant dump can't blow out the tooltip", () => {
    const huge = "x".repeat(5000);
    expect(cleanEngineError(huge).length).toBeLessThanOrEqual(800);
  });
});
