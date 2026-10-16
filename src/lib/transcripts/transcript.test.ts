import { describe, it, expect } from "vitest";
import {
  transcriptRefFor, transcriptPlainText, parseTranscript, syncAt, wordStart, flatWordIndex,
} from "./transcript";
import type { Transcript } from "./types";
import sampleJson from "./_sampleDominik.dev.json";

const t = (segments: Transcript["segments"]): Transcript => ({
  version: 1, media: "a.mp3", meta: {}, segments,
});

describe("transcript path + plaintext + parse", () => {
  it("sidecar path keeps the audio ext", () => {
    expect(transcriptRefFor("media/n1/abc.mp3")).toBe("media/n1/abc.mp3.transcript.json");
  });
  it("plaintext joins segment texts (the search corpus)", () => {
    expect(transcriptPlainText(t([
      { id: 0, speaker: "A", start: 0, end: 1, text: "hello there", words: [] },
      { id: 1, speaker: "B", start: 1, end: 2, text: "general kenobi", words: [] },
    ]))).toBe("hello there general kenobi");
  });
  it("parse returns null for malformed / non-transcript json", () => {
    expect(parseTranscript("not json")).toBeNull();
    expect(parseTranscript(JSON.stringify({ nope: true }))).toBeNull();
    expect(parseTranscript(JSON.stringify({ version: 1, media: "a", meta: {}, segments: [] }))).not.toBeNull();
  });
});

describe("segment-aware sync (multitrack overlap must not step backward)", () => {
  // Two speakers overlapping: A 0–3s, B 2–5s (B starts before A ends).
  const transcript = t([
    { id: 0, speaker: "A", start: 0, end: 3, text: "a b c", words: [
      { w: "a", s: 0, e: 1 }, { w: "b", s: 1, e: 2 }, { w: "c", s: 2, e: 3 } ] },
    { id: 1, speaker: "B", start: 2, end: 5, text: "d e f", words: [
      { w: "d", s: 2, e: 3 }, { w: "e", s: 3, e: 4 }, { w: "f", s: 4, e: 5 } ] },
  ]);

  it("returns null before the first segment", () => {
    expect(syncAt(transcript, -1)).toBeNull();
  });
  it("picks the latest-started segment at an overlap (B wins at t=2.5)", () => {
    expect(syncAt(transcript, 2.5)).toEqual({ segIndex: 1, wordIndex: 0 });
  });
  it("advances the flat word index monotonically across a dense sweep", () => {
    let prev = -1;
    for (let time = 0; time <= 5; time += 0.1) {
      const p = syncAt(transcript, time);
      if (!p) continue;
      const flat = flatWordIndex(transcript, p.segIndex, p.wordIndex);
      expect(flat).toBeGreaterThanOrEqual(prev); // NEVER backward (the flat-search bug)
      prev = flat;
    }
  });
  it("wordStart drives click-to-seek", () => {
    expect(wordStart(transcript, 1, 2)).toBe(4); // B's 3rd word "f" starts at 4s
  });
});

describe("real locked-schema sample parses (the transcription pipeline's output)", () => {
  it("parses the bundled 206-segment diarized call", () => {
    const parsed = parseTranscript(JSON.stringify(sampleJson));
    expect(parsed).not.toBeNull();
    expect(parsed!.segments.length).toBe(206);
    expect(parsed!.meta.speakers).toContain("Klient");
    expect(transcriptPlainText(parsed!)).toContain("divadlo"); // first utterance
    // sync stays monotonic over the whole real (multitrack) call
    let prev = -1;
    for (let time = 0; time <= parsed!.meta.durationSec!; time += 1) {
      const pt = syncAt(parsed!, time);
      if (!pt) continue;
      const flat = flatWordIndex(parsed!, pt.segIndex, pt.wordIndex);
      expect(flat).toBeGreaterThanOrEqual(prev);
      prev = flat;
    }
  });
});
