import { describe, it, expect } from "vitest";
import { transcriptHits } from "./transcriptMatches";
import type { Transcript } from "./types";

const w = (text: string, s: number) => ({ w: text, s, e: s + 0.4 });

const wordy: Transcript = {
  version: 1,
  media: "rec.mp3",
  meta: {},
  segments: [
    {
      id: 0, speaker: "Klient", start: 0, end: 5, text: "jaký je ten problém dnes",
      words: [w("jaký", 0), w("je", 0.5), w("ten", 1), w("problém", 1.5), w("dnes", 2)],
    },
    {
      id: 1, speaker: "Obchodník", start: 5, end: 8, text: "partnerku zatím nemám",
      words: [w("partnerku", 5), w("zatím", 6), w("nemám", 7)],
    },
  ],
};

const segOnly: Transcript = {
  version: 1,
  media: "rec.mp3",
  meta: {},
  segments: [
    { id: 0, speaker: null, start: 12, end: 15, text: "tady je ten problém", words: [] },
  ],
};

describe("transcriptHits", () => {
  it("finds a word match with its start time + speaker + ellipsed context", () => {
    const hits = transcriptHits(wordy, ["problém"]);
    expect(hits).toHaveLength(1);
    expect(hits[0].time).toBe(1.5);
    expect(hits[0].speaker).toBe("Klient");
    expect(hits[0].snippet).toContain("problém");
  });

  it("matches a term as a substring of a word token (mirrors the index: 'prob' → 'problém')", () => {
    const hits = transcriptHits(wordy, ["prob"]);
    expect(hits).toHaveLength(1);
    expect(hits[0].time).toBe(1.5);
  });

  it("returns a hit per spoken occurrence across segments", () => {
    const hits = transcriptHits(wordy, ["a"]); // appears in jaký, partnerku, zatím, nemám
    expect(hits.length).toBeGreaterThan(1);
    // document order → times are non-decreasing
    expect(hits.map((h) => h.time)).toEqual([...hits.map((h) => h.time)].sort((x, y) => x - y));
  });

  it("falls back to segment-level (jump to seg.start) when a segment has no word timings", () => {
    const hits = transcriptHits(segOnly, ["problém"]);
    expect(hits).toHaveLength(1);
    expect(hits[0].time).toBe(12);
    expect(hits[0].snippet).toBe("tady je ten problém");
  });

  it("caps the number of hits", () => {
    expect(transcriptHits(wordy, ["a"], { max: 1 })).toHaveLength(1);
  });

  it("no terms → no hits", () => {
    expect(transcriptHits(wordy, [])).toEqual([]);
    expect(transcriptHits(wordy, [""])).toEqual([]);
  });
});
