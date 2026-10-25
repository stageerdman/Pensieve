import { describe, expect, it } from "vitest";
import { parseTranscript, transcriptRefFor } from "./transcript";

describe("transcriptRefFor", () => {
  it("appends the sidecar suffix, keeping the audio extension", () => {
    expect(transcriptRefFor("media/1/a.m4a")).toBe("media/1/a.m4a.transcript.json");
  });
});

describe("parseTranscript", () => {
  it("parses a well-formed sidecar", () => {
    const json = JSON.stringify({
      version: 1,
      media: "media/1/a.m4a",
      meta: {},
      segments: [{ id: 0, speaker: null, start: 0, end: 1, text: "hi", words: [] }],
    });
    const t = parseTranscript(json);
    expect(t?.segments[0].text).toBe("hi");
  });

  it("is null for malformed JSON or a non-transcript shape", () => {
    expect(parseTranscript("not json")).toBeNull();
    expect(parseTranscript("{}")).toBeNull();
    expect(parseTranscript(JSON.stringify({ segments: "nope" }))).toBeNull();
  });
});
