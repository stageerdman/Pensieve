import { describe, it, expect } from "vitest";
import { makeEntry, groupByDay, pruneToRecentDays, truncateAfter } from "./timeline";
import type { TimelineEntry } from "./types";

describe("makeEntry", () => {
  it("records a positive delta", () => {
    const e = makeEntry(10, 152, 1000, false);
    expect(e).toEqual({ ts: 1000, wordDelta: 142 });
  });
  it("records negative deltas (trimming)", () => {
    expect(makeEntry(100, 70, 5, false)?.wordDelta).toBe(-30);
  });
  it("skips no-op sessions unless it's the first ever", () => {
    expect(makeEntry(50, 50, 1, false)).toBeNull();
    expect(makeEntry(0, 0, 1, true)).toEqual({
      ts: 1,
      wordDelta: 0,
      created: true,
    });
  });
  it("attaches a body snapshot when given (the restorable version)", () => {
    expect(makeEntry(10, 12, 1000, false, "# hi")).toEqual({
      ts: 1000,
      wordDelta: 2,
      markdown: "# hi",
    });
  });
  it("stores an empty-string snapshot (a deliberately-emptied note is still a version)", () => {
    const e = makeEntry(5, 0, 1, false, "");
    expect(e?.markdown).toBe("");
  });
});

describe("pruneToRecentDays", () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const d = (day: number, h = 12) => new Date(2026, 0, day, h).getTime();

  it("keeps everything when there are at most maxDays distinct days", () => {
    const entries: TimelineEntry[] = [
      { ts: d(1), wordDelta: 1 },
      { ts: d(1, 15), wordDelta: 2 }, // same day
      { ts: d(2), wordDelta: 3 },
    ];
    expect(pruneToRecentDays(entries, 7)).toHaveLength(3);
  });

  it("drops the oldest whole day beyond the 7 most recent edit-days", () => {
    // 8 distinct days of edits — day 1 (oldest) must be dropped entirely.
    const entries: TimelineEntry[] = Array.from({ length: 8 }, (_, i) => ({
      ts: d(i + 1),
      wordDelta: i + 1,
    }));
    const kept = pruneToRecentDays(entries, 7);
    expect(kept).toHaveLength(7);
    expect(kept.some((e) => e.ts === d(1))).toBe(false); // oldest day gone
    expect(kept.some((e) => e.ts === d(8))).toBe(true); // newest kept
  });

  it("measures recency against the history, not today (keeps old entries if that's all there is)", () => {
    const entries: TimelineEntry[] = [
      { ts: d(1), wordDelta: 1 },
      { ts: d(2), wordDelta: 2 },
    ];
    // Even though these are 'old', with only 2 edit-days both survive.
    expect(pruneToRecentDays(entries, 7)).toHaveLength(2);
  });

  it("keeps every entry on a surviving day (multiple sessions per day)", () => {
    const entries: TimelineEntry[] = [
      { ts: d(1), wordDelta: 1 },
      { ts: d(1, 9), wordDelta: 2 },
      { ts: d(1, 18), wordDelta: 3 },
    ];
    expect(pruneToRecentDays(entries, 7)).toHaveLength(3);
    void dayMs;
  });
});

describe("truncateAfter", () => {
  const entries: TimelineEntry[] = [
    { ts: 100, wordDelta: 1, markdown: "v1" },
    { ts: 200, wordDelta: 2, markdown: "v2" },
    { ts: 300, wordDelta: 3, markdown: "v3" },
  ];

  it("keeps the matched entry and drops everything newer", () => {
    const out = truncateAfter(entries, 200);
    expect(out.map((e) => e.markdown)).toEqual(["v1", "v2"]);
  });
  it("is a no-op at the newest entry", () => {
    expect(truncateAfter(entries, 300)).toHaveLength(3);
  });
  it("returns the input unchanged when ts is unknown", () => {
    expect(truncateAfter(entries, 999)).toHaveLength(3);
  });
  it("sorts by ts before truncating (robust to unordered storage)", () => {
    const shuffled: TimelineEntry[] = [entries[2], entries[0], entries[1]];
    expect(truncateAfter(shuffled, 100).map((e) => e.markdown)).toEqual(["v1"]);
  });
});

describe("groupByDay", () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date("2026-09-26T12:00:00").getTime();
  const entries: TimelineEntry[] = [
    { ts: now - 60_000, wordDelta: 10 }, // today
    { ts: now - 30 * 60_000, wordDelta: 5 }, // today
    { ts: now - dayMs, wordDelta: 20, created: true }, // yesterday
    { ts: now - 5 * dayMs, wordDelta: 3 }, // older
  ];

  it("labels today/yesterday and groups newest first", () => {
    const groups = groupByDay(entries, now);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].label).toBe("Yesterday");
    expect(groups[1].entries).toHaveLength(1);
    expect(groups[2].entries[0].wordDelta).toBe(3);
  });
});
