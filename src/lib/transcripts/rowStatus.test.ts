import { describe, it, expect } from "vitest";
import { rowStatus } from "./rowStatus";

describe("rowStatus (pure)", () => {
  it("idle shows no status line (the row shows its Transcribe button)", () => {
    expect(rowStatus("idle")).toEqual({ text: null, tone: "muted", showDot: false, pulse: false });
  });

  it("queued is present but still (only the running row pulses)", () => {
    const s = rowStatus("queued");
    expect(s.text).toBe("Queued");
    expect(s.pulse).toBe(false);
    expect(s.showDot).toBe(true);
  });

  it("transcribing pulses in accent and rounds the percent", () => {
    const s = rowStatus("transcribing", "transcribing", 0.404);
    expect(s).toMatchObject({ text: "Transcribing… 40%", tone: "accent", pulse: true });
  });

  it("transcribing with no progress omits the percent", () => {
    expect(rowStatus("transcribing", "transcribing").text).toBe("Transcribing…");
  });

  it("polishing is the gold phase", () => {
    expect(rowStatus("transcribing", "polishing")).toMatchObject({ text: "Polishing…", tone: "gold" });
  });

  it("clamps out-of-range progress", () => {
    expect(rowStatus("transcribing", "transcribing", 1.9).text).toBe("Transcribing… 100%");
    expect(rowStatus("transcribing", "transcribing", -0.5).text).toBe("Transcribing… 0%");
  });

  it("done is a static success check; error is danger, not pulsing", () => {
    expect(rowStatus("done")).toMatchObject({ text: "✓ Transcribed", tone: "success", pulse: false });
    expect(rowStatus("error")).toMatchObject({ text: "Couldn't transcribe", tone: "danger", pulse: false });
  });
});
