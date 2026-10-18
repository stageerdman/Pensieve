import { describe, it, expect } from "vitest";
import { _mapPhase } from "./nativeEngine";

describe("nativeEngine phase mapping", () => {
  it("maps the Python engine's stderr phases to the seam's TranscribePhase", () => {
    expect(_mapPhase("load-audio")).toBe("decoding");
    expect(_mapPhase("transcribe")).toBe("transcribing");
    expect(_mapPhase("polish")).toBe("polishing");
    expect(_mapPhase("done")).toBe("saving");
    expect(_mapPhase("anything-else")).toBe("transcribing"); // safe default
  });
});
