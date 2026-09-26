import { describe, it, expect } from "vitest";
import { makeEntry, groupByDay } from "./timeline";
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
