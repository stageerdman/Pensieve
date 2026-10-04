import { describe, it, expect } from "vitest";
import { arrange } from "./arrange";
import { DEFAULT_VIEW, effectiveGroup, type SidebarView } from "./view";
import type { NoteMeta } from "../types";

// A fixed "now" so date bucketing is deterministic. 2026-10-04 12:00 local.
const NOW = new Date(2026, 9, 4, 12, 0, 0).getTime();
const DAY = 86_400_000;

function note(p: Partial<NoteMeta> & { id: string }): NoteMeta {
  return {
    title: p.title ?? "Untitled",
    createdAt: p.createdAt ?? NOW,
    updatedAt: p.updatedAt ?? NOW,
    categories: p.categories,
    tags: p.tags,
    pinned: p.pinned,
    excerpt: p.excerpt,
    ...p,
  };
}

const view = (p: Partial<SidebarView> = {}): SidebarView => ({ ...DEFAULT_VIEW, ...p });

describe("arrange — sorting", () => {
  it("orders by updatedAt desc by default, flat (one unlabelled section)", () => {
    const notes = [
      note({ id: "a", updatedAt: NOW - 2 * DAY }),
      note({ id: "b", updatedAt: NOW }),
      note({ id: "c", updatedAt: NOW - DAY }),
    ];
    const [section] = arrange(notes, view(), NOW);
    expect(section.label).toBeNull();
    expect(section.notes.map((n) => n.id)).toEqual(["b", "c", "a"]);
  });

  it("orders by title with numeric-aware, case-insensitive compare", () => {
    const notes = [
      note({ id: "a", title: "Note 10" }),
      note({ id: "b", title: "note 2" }),
      note({ id: "c", title: "Alpha" }),
    ];
    const [section] = arrange(notes, view({ sortKey: "title", sortDir: "asc" }), NOW);
    expect(section.notes.map((n) => n.title)).toEqual(["Alpha", "note 2", "Note 10"]);
  });

  it("is stable for equal sort values via an id tiebreak, regardless of input order", () => {
    const a = note({ id: "aaa", updatedAt: NOW });
    const b = note({ id: "bbb", updatedAt: NOW });
    const asc = view({ sortDir: "asc" });
    expect(arrange([b, a], asc, NOW)[0].notes.map((n) => n.id)).toEqual(["aaa", "bbb"]);
    expect(arrange([a, b], asc, NOW)[0].notes.map((n) => n.id)).toEqual(["aaa", "bbb"]);
  });
});

describe("arrange — pinned band", () => {
  it("pulls pinned notes into a leading 'Pinned' section, excluded from below", () => {
    const notes = [
      note({ id: "p", updatedAt: NOW - 5 * DAY, pinned: true }),
      note({ id: "x", updatedAt: NOW }),
    ];
    const sections = arrange(notes, view(), NOW);
    expect(sections[0].label).toBe("Pinned");
    expect(sections[0].notes.map((n) => n.id)).toEqual(["p"]);
    expect(sections[1].notes.map((n) => n.id)).toEqual(["x"]);
  });

  it("omits the 'Pinned' header when every note is pinned (no lonely header)", () => {
    const notes = [note({ id: "p", pinned: true })];
    const sections = arrange(notes, view(), NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBeNull();
  });
});

describe("arrange — date grouping", () => {
  it("buckets by Today / Yesterday / This week / This month / Earlier, skipping empties", () => {
    const notes = [
      note({ id: "today", updatedAt: NOW }),
      note({ id: "yday", updatedAt: NOW - DAY }),
      note({ id: "week", updatedAt: NOW - 4 * DAY }),
      note({ id: "old", updatedAt: NOW - 100 * DAY }),
    ];
    const sections = arrange(notes, view({ group: "date" }), NOW);
    expect(sections.map((s) => s.label)).toEqual(["Today", "Yesterday", "This week", "Earlier"]);
  });

  it("buckets by createdAt when sorting by createdAt", () => {
    const notes = [note({ id: "a", createdAt: NOW, updatedAt: NOW - 100 * DAY })];
    const [section] = arrange(notes, view({ group: "date", sortKey: "createdAt" }), NOW);
    expect(section.label).toBe("Today");
  });
});

describe("arrange — category grouping", () => {
  it("sections in declared order with a trailing Uncategorised; multi-category once", () => {
    const notes = [
      note({ id: "e", categories: ["Execution"] }),
      note({ id: "n", categories: ["Notes & Lessons", "Execution"] }),
      note({ id: "u", categories: [] }),
    ];
    const order = ["Notes & Lessons", "In my mind", "Execution"];
    const sections = arrange(notes, view({ group: "category" }), NOW, order);
    expect(sections.map((s) => s.label)).toEqual([
      "Notes & Lessons",
      "Execution",
      "Uncategorised",
    ]);
    // the multi-category note lands only in its first category
    expect(sections[0].notes.map((n) => n.id)).toEqual(["n"]);
    expect(sections[1].notes.map((n) => n.id)).toEqual(["e"]);
  });

  it("never drops a note whose category is not in the provided order", () => {
    const notes = [note({ id: "h", categories: ["health"] })];
    const sections = arrange(notes, view({ group: "category" }), NOW, ["Execution"]);
    expect(sections.map((s) => s.label)).toEqual(["health"]);
    expect(sections[0].notes.map((n) => n.id)).toEqual(["h"]);
  });
});

describe("effectiveGroup", () => {
  it("collapses date grouping to flat when sorting by name", () => {
    expect(effectiveGroup(view({ sortKey: "title", group: "date" }))).toBe("none");
  });
  it("keeps category grouping when sorting by name", () => {
    expect(effectiveGroup(view({ sortKey: "title", group: "category" }))).toBe("category");
  });
  it("keeps date grouping for date sorts", () => {
    expect(effectiveGroup(view({ sortKey: "updatedAt", group: "date" }))).toBe("date");
  });
});

describe("arrange — edge cases", () => {
  it("returns no sections for an empty list", () => {
    expect(arrange([], view(), NOW)).toEqual([]);
  });
});
