import { describe, it, expect } from "vitest";
import { MemoryIndex } from "./indexer";

const docs = [
  { id: "a", text: "Shipped the Summon bar. Felt calm after the morning walk." },
  { id: "b", text: "Whisper.cpp small model is accurate enough for voice notes." },
  { id: "c", text: "Walking every morning fixed my energy dip." },
];

const built = () => {
  const ix = new MemoryIndex();
  ix.set(docs);
  return ix;
};
const prefix = (ix: MemoryIndex, term: string) => [...ix.termHits(term).prefix].sort();
const exact = (ix: MemoryIndex, term: string) => [...ix.termHits(term).exact].sort();

describe("MemoryIndex", () => {
  it("finds a whole word, case-insensitively", () => {
    const ix = built();
    expect(exact(ix, "summon")).toEqual(["a"]);
    expect(exact(ix, "morning")).toEqual(["a", "c"]);
  });

  it("a term matches the words it starts (walk → walking), not words it sits inside", () => {
    const ix = built();
    expect(exact(ix, "walk")).toEqual(["a"]);
    expect(prefix(ix, "walk")).toEqual(["a", "c"]);
    expect(prefix(ix, "alk")).toEqual([]);
  });

  it("update replaces a doc's words, including ones new to the vocabulary", () => {
    const ix = built();
    ix.termHits("gardens"); // memoised empty — must not survive the update
    ix.update("a", "Completely different content about gardens.");
    expect(prefix(ix, "summon")).toEqual([]);
    expect(prefix(ix, "garden")).toEqual(["a"]);
    expect(ix.size).toBe(3);
  });

  it("remove drops a doc and its now-unused words", () => {
    const ix = built();
    ix.remove("b");
    expect(prefix(ix, "voice")).toEqual([]);
    expect(ix.size).toBe(2);
  });

  it("hasPhrase finds words in order, the last one possibly half-typed", () => {
    const ix = built();
    expect(ix.hasPhrase("a", " the morning walk")).toBe(true);
    expect(ix.hasPhrase("a", " the morning wa")).toBe(true);
    expect(ix.hasPhrase("a", " morning the")).toBe(false);
    expect(ix.hasPhrase("a", "")).toBe(false);
  });

  it("text() keeps the original case; lowerText() is its lower-cased twin", () => {
    const ix = built();
    expect(ix.text("a")).toContain("Summon");
    expect(ix.lowerText("a")).toBe(ix.text("a")!.toLowerCase());
    expect(ix.lowerText("zzz")).toBeUndefined();
  });

  it("the sliced cold build ends equal to the one-shot build", async () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({ id: `n${i}`, text: `note ${i} about topic${i % 50} and more words` }));
    const sliced = new MemoryIndex();
    await sliced.setInSlices(many, async () => {});
    const oneShot = new MemoryIndex();
    oneShot.set(many);
    expect(sliced.size).toBe(oneShot.size);
    expect([...sliced.termHits("topic4").prefix].sort()).toEqual([...oneShot.termHits("topic4").prefix].sort());
  });
});
