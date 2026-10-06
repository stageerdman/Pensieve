import { describe, it, expect } from "vitest";
import { runSearch, isEmptyQuery } from "./search";
import { MemoryIndex } from "./indexer";
import type { NoteMeta } from "../types";
import type { FilterQuery, FilterLeaf } from "./types";

const NOW = new Date(2026, 1, 18, 12).getTime();

const notes: NoteMeta[] = [
  {
    id: "a",
    title: "Summon bar design",
    createdAt: new Date(2026, 0, 20).getTime(),
    updatedAt: NOW,
    categories: ["Execution"],
    tags: ["#planning"],
  },
  {
    id: "b",
    title: "Morning walk",
    createdAt: new Date(2026, 1, 17).getTime(),
    updatedAt: NOW,
    categories: ["Notes & Lessons"],
    tags: ["#walk", "#mood"],
    pinned: true,
  },
  {
    id: "c",
    title: "Whisper model notes",
    createdAt: new Date(2025, 11, 2).getTime(),
    updatedAt: NOW,
    categories: ["Notes & Lessons"],
    tags: ["#spike"],
  },
];

const index = new MemoryIndex();
index.set([
  { id: "a", text: "Shipped the summon bar. Latency under 150ms to first keystroke." },
  { id: "b", text: "Felt genuinely calm after the morning walk and no phone." },
  { id: "c", text: "whisper.cpp small model is accurate enough for voice notes." },
]);

const leaf = (filter: FilterLeaf["filter"], id = "l"): FilterLeaf => ({ type: "leaf", id, filter });
const q = (over: Partial<FilterQuery> = {}): FilterQuery => ({ text: "", items: [], ...over });

describe("isEmptyQuery", () => {
  it("true only with no items and no text", () => {
    expect(isEmptyQuery(q())).toBe(true);
    expect(isEmptyQuery(q({ text: "x" }))).toBe(false);
    expect(isEmptyQuery(q({ items: [leaf({ kind: "flag", flag: "pinned" })] }))).toBe(false);
  });
});

describe("runSearch — structural filters", () => {
  it("filters by a single tag chip", () => {
    const r = runSearch(notes, q({ items: [leaf({ kind: "tag", tags: ["#walk"] })] }), index);
    expect(r.notes.map((n) => n.id)).toEqual(["b"]);
    expect(r.match.get("b")!.where).toBeNull(); // no text query
  });

  it("AND of two chips", () => {
    const r = runSearch(
      notes,
      q({ items: [leaf({ kind: "category", categories: ["Notes & Lessons"] }), leaf({ kind: "flag", flag: "pinned" })] }),
      index,
    );
    expect(r.notes.map((n) => n.id)).toEqual(["b"]);
  });

  it("date chip ranges over createdAt", () => {
    const jan = { start: new Date(2026, 0, 1).getTime(), end: new Date(2026, 0, 31, 23, 59, 59, 999).getTime() };
    const r = runSearch(notes, q({ items: [leaf({ kind: "date", field: "created", range: jan, phrase: "last month" })] }), index);
    expect(r.notes.map((n) => n.id)).toEqual(["a"]);
  });
});

describe("runSearch — full text + ranking", () => {
  it("matches body and attaches a snippet, ranked as text", () => {
    const r = runSearch(notes, q({ text: "latency" }), index);
    expect(r.notes.map((n) => n.id)).toEqual(["a"]);
    const m = r.match.get("a")!;
    expect(m.where).toBe("text");
    expect(m.rank).toBe(2);
    expect(m.snippet!.text.toLowerCase()).toContain("latency");
  });

  it("title match ranks above tag/body", () => {
    const r = runSearch(notes, q({ text: "whisper" }), index);
    // title "Whisper model notes" contains whisper -> where title
    expect(r.match.get("c")!.where).toBe("title");
    expect(r.match.get("c")!.rank).toBe(0);
  });

  it("tag match when not in title/body", () => {
    const r = runSearch(notes, q({ text: "planning" }), index);
    expect(r.notes.map((n) => n.id)).toEqual(["a"]);
    expect(r.match.get("a")!.where).toBe("tag");
    expect(r.match.get("a")!.rank).toBe(1);
  });

  it("text AND structural chip compose", () => {
    const r = runSearch(
      notes,
      q({ text: "calm", items: [leaf({ kind: "flag", flag: "pinned" })] }),
      index,
    );
    expect(r.notes.map((n) => n.id)).toEqual(["b"]);
    expect(r.match.get("b")!.where).toBe("text");
  });

  it("no matches → empty", () => {
    expect(runSearch(notes, q({ text: "zzzz" }), index).notes).toHaveLength(0);
  });

  it("preserves input order (gallery groups/sorts)", () => {
    const r = runSearch(notes, q({ text: "notes" }), index);
    // "notes" appears in b? no. in c title "Whisper model notes" and body c. a? body "first keystroke" no.
    // keep whatever matches, in the original a,b,c order
    expect(r.notes.map((n) => n.id)).toEqual(r.notes.map((n) => n.id).slice().sort((x, y) => (x < y ? -1 : 1)));
  });
});
