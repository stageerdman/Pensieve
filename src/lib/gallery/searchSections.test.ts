import { describe, it, expect } from "vitest";
import { searchSections, STARRED_SECTION_KEY } from "./searchSections";
import { bucketize } from "./buckets";
import { runSearch } from "../search/search";
import { MemoryIndex } from "../search/indexer";
import type { NoteMeta } from "../types";
import type { FilterLeaf, FilterQuery } from "../search/types";

// Locks in P4's "starred rises way on top" — composed with the REAL runSearch so the test
// covers what the gallery actually renders, not a hand-built match map.

const NOW = new Date(2026, 10, 15, 12).getTime();
const DAY = 86_400_000;

function note(p: Partial<NoteMeta> & { id: string }): NoteMeta {
  return { title: p.id, createdAt: NOW - 100 * DAY, updatedAt: NOW - 100 * DAY, tags: [], ...p };
}

const notes: NoteMeta[] = [
  // Non-starred, fresh title match — today's bucket.
  note({ id: "fresh", title: "Focus plan", updatedAt: NOW }),
  // Starred, OLD, matched only in the body.
  note({ id: "starBody", title: "Old lesson", starred: true, updatedAt: NOW - 400 * DAY }),
  // Starred, matched in the title, older than starTitleNew.
  note({ id: "starTitleOld", title: "Focus is a muscle", starred: true, updatedAt: NOW - 300 * DAY }),
  note({ id: "starTitleNew", title: "On focus", starred: true, updatedAt: NOW - 30 * DAY }),
  // Starred, matched via tag.
  note({ id: "starTag", title: "Morning", tags: ["#focus"], starred: true, updatedAt: NOW - DAY }),
  // Starred but does NOT match "focus" at all.
  note({ id: "starMiss", title: "Unrelated", starred: true, updatedAt: NOW }),
  // Non-starred, body match.
  note({ id: "plainBody", title: "Walk", updatedAt: NOW - 2 * DAY }),
];

const index = new MemoryIndex();
index.set([
  { id: "starBody", text: "the whole point was focus" },
  { id: "plainBody", text: "kept my focus on the path" },
  { id: "starMiss", text: "nothing here" },
]);

const q = (text: string, items: FilterLeaf[] = []): FilterQuery => ({ text, items });
const leaf = (filter: FilterLeaf["filter"], id = "f"): FilterLeaf => ({ type: "leaf", id, filter });

function layout(query: FilterQuery) {
  const out = runSearch(notes, query, index);
  return searchSections(out.notes, out.match, NOW);
}

describe("searchSections — starred text matches lead", () => {
  it("lifts every starred match into one leading 'Starred' section, ranked title > tag > body, then newest", () => {
    const sections = layout(q("focus"));
    expect(sections[0].key).toBe(STARRED_SECTION_KEY);
    expect(sections[0].label).toBe("Starred");
    expect(sections[0].notes.map((n) => n.id)).toEqual([
      "starTitleNew", // title, newer
      "starTitleOld", // title, older
      "starTag", // tag
      "starBody", // body only — still above every non-starred note
    ]);
  });

  it("keeps non-starred matches in their date buckets, never duplicating a lifted note", () => {
    const sections = layout(q("focus"));
    const rest = sections.slice(1).flatMap((s) => s.notes.map((n) => n.id));
    expect(rest.sort()).toEqual(["fresh", "plainBody"]);
    const all = sections.flatMap((s) => s.notes.map((n) => n.id));
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("starMiss"); // starred but no match → not surfaced
  });

  it("a text + chip query still lifts", () => {
    const sections = layout(q("focus", [leaf({ kind: "date", field: "updated", range: { start: 0, end: NOW }, phrase: "any" })]));
    expect(sections[0].key).toBe(STARRED_SECTION_KEY);
  });

  it("a chip-only query does not lift — the plain updated-date view", () => {
    const out = runSearch(notes, q("", [leaf({ kind: "tag", tags: ["#focus"] })]), index);
    expect(searchSections(out.notes, out.match, NOW)).toEqual(bucketize(out.notes, NOW, "updated"));
  });

  it("the `starred` chip + text (every result starred) shows date buckets, not a redundant section", () => {
    const sections = layout(q("focus", [leaf({ kind: "flag", flag: "starred" })]));
    expect(sections.some((s) => s.key === STARRED_SECTION_KEY)).toBe(false);
    expect(sections.flatMap((s) => s.notes).every((n) => n.starred)).toBe(true);
  });

  it("no starred matches → exactly the existing updated-date layout", () => {
    const out = runSearch(notes, q("walk"), index);
    expect(searchSections(out.notes, out.match, NOW)).toEqual(bucketize(out.notes, NOW, "updated"));
  });

  it("scales to many starred matches (all lifted, stable order)", () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      note({ id: `s${String(i).padStart(3, "0")}`, title: `focus ${i}`, starred: true, updatedAt: NOW - i * DAY }),
    );
    const plain = note({ id: "plain", title: "focus plain", updatedAt: NOW });
    const out = runSearch([plain, ...many], q("focus"), new MemoryIndex());
    const sections = searchSections(out.notes, out.match, NOW);
    expect(sections[0].notes).toHaveLength(120);
    expect(sections[0].notes[0].id).toBe("s000");
    expect(sections[1].notes.map((n) => n.id)).toEqual(["plain"]);
  });
});
