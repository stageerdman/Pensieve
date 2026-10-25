import { describe, expect, it } from "vitest";
import { mediaContentType } from "./adapter";

describe("mediaContentType", () => {
  it("maps common image extensions", () => {
    expect(mediaContentType("media/1/a.png")).toBe("image/png");
    expect(mediaContentType("media/1/a.JPG")).toBe("image/jpeg");
  });

  it("maps common audio extensions — a missing/wrong type here is exactly why only some recordings played (see vault.ts's writeMediaBytes)", () => {
    expect(mediaContentType("media/1/a.m4a")).toBe("audio/mp4");
    expect(mediaContentType("media/1/a.mp3")).toBe("audio/mpeg");
    expect(mediaContentType("media/1/a.wav")).toBe("audio/wav");
    expect(mediaContentType("media/1/a.webm")).toBe("audio/webm");
  });

  it("falls back to a generic octet-stream for an unknown extension (e.g. a transcript sidecar)", () => {
    expect(mediaContentType("media/1/a.m4a.transcript.json")).toBe("application/octet-stream");
  });
});
