import { describe, it, expect } from "vitest";
import { MemoryIndex } from "./indexer";

const docs = [
  { id: "a", text: "Shipped the Summon bar. Felt calm after the morning walk." },
  { id: "b", text: "Whisper.cpp small model is accurate enough for voice notes." },
  { id: "c", text: "Walking every morning fixed my energy dip." },
];

describe("MemoryIndex", () => {
  it("matches a whole word", () => {
    const ix = new MemoryIndex();
    ix.set(docs);
    expect([...ix.query("summon")]).toEqual(["a"]);
    expect([...ix.query("morning")].sort()).toEqual(["a", "c"]);
  });

  it("matches substrings/prefixes (walk → walking)", () => {
    const ix = new MemoryIndex();
    ix.set(docs);
    expect([...ix.query("walk")].sort()).toEqual(["a", "c"]);
  });

  it("ANDs multiple terms", () => {
    const ix = new MemoryIndex();
    ix.set(docs);
    expect([...ix.query("morning walk")].sort()).toEqual(["a", "c"]);
    expect([...ix.query("summon walk")]).toEqual(["a"]);
    expect([...ix.query("summon voice")]).toEqual([]);
  });

  it("empty query returns all ids", () => {
    const ix = new MemoryIndex();
    ix.set(docs);
    expect(ix.query("").size).toBe(3);
    expect(ix.query("   ").size).toBe(3);
  });

  it("update replaces a doc's tokens", () => {
    const ix = new MemoryIndex();
    ix.set(docs);
    ix.update("a", "Completely different content about gardens.");
    expect([...ix.query("summon")]).toEqual([]);
    expect([...ix.query("gardens")]).toEqual(["a"]);
    expect(ix.size).toBe(3);
  });

  it("remove drops a doc and cleans empty postings", () => {
    const ix = new MemoryIndex();
    ix.set(docs);
    ix.remove("b");
    expect([...ix.query("voice")]).toEqual([]);
    expect(ix.size).toBe(2);
  });

  it("text() returns original-case haystack for snippets", () => {
    const ix = new MemoryIndex();
    ix.set(docs);
    expect(ix.text("a")).toContain("Summon");
  });
});
