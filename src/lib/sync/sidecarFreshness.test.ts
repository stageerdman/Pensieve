import { describe, expect, it } from "vitest";
import { isRewrittenSidecar } from "./sidecarFreshness";

const SIDE = "media/n/a.wav.transcript.json";

describe("isRewrittenSidecar", () => {
  it("a re-transcribed sidecar (size changed since sync) goes up again — 2026-11-20 bug: the phone kept the first transcript", () => {
    expect(isRewrittenSidecar(SIDE, { ref: SIDE, backedUp: true, size: 100 }, 57357)).toBe(true);
  });
  it("a sidecar synced before sizes were recorded is re-sent once", () => {
    expect(isRewrittenSidecar(SIDE, { ref: SIDE, backedUp: true }, 10)).toBe(true);
  });
  it("an unchanged sidecar, any audio/image, or a not-yet-backed-up ref is left alone", () => {
    expect(isRewrittenSidecar(SIDE, { ref: SIDE, backedUp: true, size: 10 }, 10)).toBe(false);
    expect(isRewrittenSidecar("media/n/a.wav", { ref: "media/n/a.wav", backedUp: true }, 10)).toBe(false);
    expect(isRewrittenSidecar(SIDE, { ref: SIDE, backedUp: false }, 10)).toBe(false);
  });
});
