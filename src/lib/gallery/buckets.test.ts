import { describe, it, expect } from "vitest";
import { bucketize } from "./buckets";
import type { NoteMeta } from "../types";

// A fixed "now" so date bucketing is deterministic: 2026-10-04 12:00 local.
const NOW = new Date(2026, 9, 4, 12, 0, 0).getTime();
const DAY = 86_400_000;

function note(p: Partial<NoteMeta> & { id: string; createdAt: number }): NoteMeta {
  return {
    title: p.title ?? "Untitled",
    updatedAt: p.updatedAt ?? p.createdAt,
    ...p,
  };
}

function labels(notes: NoteMeta[]) {
  return bucketize(notes, NOW).map((s) => s.label);
}

describe("bucketize — bucket assignment", () => {
  it("assigns the recent relative buckets at the right boundaries", () => {
    const notes = [
      note({ id: "today", createdAt: NOW }),
      note({ id: "earlier-today", createdAt: new Date(2026, 9, 4, 1, 0, 0).getTime() }),
      note({ id: "yesterday", createdAt: NOW - DAY }),
      note({ id: "3d", createdAt: NOW - 3 * DAY }), // last week
      note({ id: "6d", createdAt: NOW - 6 * DAY }), // still last week
      note({ id: "10d", createdAt: NOW - 10 * DAY }), // last month
      note({ id: "29d", createdAt: NOW - 29 * DAY }), // still last month
    ];
    const sections = bucketize(notes, NOW);
    const map = Object.fromEntries(
      sections.map((s) => [s.label, s.notes.map((n) => n.id)]),
    );
    expect(map["Today"]).toEqual(["today", "earlier-today"]); // newest first within bucket
    expect(map["Yesterday"]).toEqual(["yesterday"]);
    expect(map["Last week"]).toEqual(["3d", "6d"]); // newest first
    expect(map["Last month"]).toEqual(["10d", "29d"]);
  });

  it("drops anything older than 30 days into its calendar month", () => {
    const notes = [
      note({ id: "aug", createdAt: new Date(2026, 7, 15, 9).getTime() }),
      note({ id: "jul", createdAt: new Date(2026, 6, 2, 9).getTime() }),
    ];
    const map = Object.fromEntries(
      bucketize(notes, NOW).map((s) => [s.label, s.notes.map((n) => n.id)]),
    );
    expect(map["August"]).toEqual(["aug"]);
    expect(map["July"]).toEqual(["jul"]);
  });
});

describe("bucketize — ordering (newest on top)", () => {
  it("orders buckets newest-first: Today, Yesterday, Last week, Last month, months …", () => {
    const notes = [
      note({ id: "t", createdAt: NOW }),
      note({ id: "y", createdAt: NOW - DAY }),
      note({ id: "w", createdAt: NOW - 4 * DAY }),
      note({ id: "mo", createdAt: NOW - 20 * DAY }),
      note({ id: "aug", createdAt: new Date(2026, 7, 10).getTime() }),
      note({ id: "jun", createdAt: new Date(2026, 5, 10).getTime() }),
    ];
    expect(labels(notes)).toEqual([
      "Today",
      "Yesterday",
      "Last week",
      "Last month",
      "August",
      "June",
    ]);
  });

  it("sorts notes descending by createdAt within a bucket, id as tie-break", () => {
    const notes = [
      note({ id: "b", createdAt: new Date(2026, 5, 10).getTime() }),
      note({ id: "a", createdAt: new Date(2026, 5, 10).getTime() }), // same ts -> id order
      note({ id: "c", createdAt: new Date(2026, 5, 5).getTime() }), // earlier -> last
    ];
    const [section] = bucketize(notes, NOW);
    expect(section.label).toBe("June");
    expect(section.notes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("bucketize — month labels", () => {
  it("shows just the month for the current year", () => {
    const n = note({ id: "x", createdAt: new Date(2026, 1, 3).getTime() });
    const [s] = bucketize([n], NOW);
    expect(s.label).toBe("February");
    expect(s.short).toBe("Feb");
  });

  it("adds a 2-digit year for prior years", () => {
    const n = note({ id: "x", createdAt: new Date(2025, 1, 3).getTime() });
    const [s] = bucketize([n], NOW);
    expect(s.label).toBe("Feb '25");
    expect(s.short).toBe("Feb '25");
  });

  it("keeps same-month different-year buckets separate and ordered newest-first", () => {
    const notes = [
      note({ id: "feb26", createdAt: new Date(2026, 1, 10).getTime() }),
      note({ id: "feb25", createdAt: new Date(2025, 1, 10).getTime() }),
    ];
    expect(labels(notes)).toEqual(["February", "Feb '25"]);
  });
});

describe("bucketize — by updatedAt (Accio recency order)", () => {
  it("buckets AND sorts by updatedAt when by='updated' (both use the same field)", () => {
    const notes = [
      // Created back in June, but last worked with TODAY → must land in "Today", not June.
      note({ id: "old-but-fresh", createdAt: new Date(2026, 5, 1).getTime(), updatedAt: NOW }),
      // Created today, untouched since → under "Today" too, but edited earlier than the above.
      note({ id: "new-today", createdAt: NOW, updatedAt: new Date(2026, 9, 4, 2).getTime() }),
      // Created today, last edited a week ago → "Last week" by recency of work.
      note({ id: "edited-last-week", createdAt: NOW, updatedAt: NOW - 4 * DAY }),
    ];
    const map = Object.fromEntries(
      bucketize(notes, NOW, "updated").map((s) => [s.label, s.notes.map((n) => n.id)]),
    );
    expect(map["Today"]).toEqual(["old-but-fresh", "new-today"]); // most-recently-edited first
    expect(map["Last week"]).toEqual(["edited-last-week"]);
  });

  it("default (no selector) still buckets by createdAt", () => {
    const n = note({ id: "x", createdAt: new Date(2026, 5, 1).getTime(), updatedAt: NOW });
    expect(bucketize([n], NOW)[0].label).toBe("June");
  });
});

describe("bucketize — edge cases", () => {
  it("returns no sections for an empty list", () => {
    expect(bucketize([], NOW)).toEqual([]);
  });

  it("never emits an empty bucket", () => {
    const sections = bucketize([note({ id: "t", createdAt: NOW })], NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0].notes).toHaveLength(1);
  });
});
