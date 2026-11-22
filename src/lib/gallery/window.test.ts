import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  countWithin,
  dueToCollapse,
  extendCutoff,
  hasMoreBefore,
  initialCutoff,
  markVisibility,
  windowSections,
  type FarSince,
} from "./window";
import type { GallerySection } from "./buckets";
import type { NoteMeta } from "../types";

const NOW = new Date(2026, 10, 15, 15, 0).getTime();
const today0 = new Date(2026, 10, 15).getTime();
const desc = (xs: number[]) => [...xs].sort((a, b) => b - a);
// n cards, one per `gapDays` going back from now.
const spaced = (n: number, gapDays: number) => desc(Array.from({ length: n }, (_, i) => NOW - i * gapDays * DAY_MS));

describe("gallery window — opening cutoff", () => {
  it("a busy week: exactly the last 7 days (from local midnight), even past 24 cards", () => {
    const ts = spaced(100, 0.25); // 4/day → 28 in the week
    const c = initialCutoff(ts, NOW);
    expect(c).toBe(today0 - 7 * DAY_MS);
    expect(countWithin(ts, c)).toBeGreaterThan(24);
    expect(ts.filter((t) => t >= c).every((t) => t >= today0 - 7 * DAY_MS)).toBe(true);
  });

  it("a sparse week stretches back to fill at least 24 cards", () => {
    const ts = spaced(100, 10); // one card every 10 days
    const c = initialCutoff(ts, NOW);
    expect(countWithin(ts, c)).toBe(24);
    expect(c).toBe(ts[23]);
  });

  it("fewer than 24 cards in total → everything, nothing more to load", () => {
    const ts = spaced(5, 30);
    const c = initialCutoff(ts, NOW);
    expect(countWithin(ts, c)).toBe(5);
    expect(hasMoreBefore(ts, c)).toBe(false);
    expect(initialCutoff([], NOW)).toBe(today0 - 7 * DAY_MS); // empty vault is fine
    expect(hasMoreBefore([], 0)).toBe(false);
  });
});

describe("gallery window — loading older weeks", () => {
  it("each step adds a week, and at least 12 cards, until everything is in", () => {
    const ts = spaced(200, 0.5); // 2/day
    let c = initialCutoff(ts, NOW);
    let shown = countWithin(ts, c);
    let steps = 0;
    while (hasMoreBefore(ts, c)) {
      const next = extendCutoff(ts, c);
      expect(next).toBeLessThanOrEqual(c - 7 * DAY_MS);
      const nowShown = countWithin(ts, next);
      expect(nowShown - shown).toBeGreaterThanOrEqual(Math.min(12, ts.length - shown));
      c = next;
      shown = nowShown;
      steps++;
      expect(steps).toBeLessThan(50);
    }
    expect(shown).toBe(200);
    expect(extendCutoff(ts, c)).toBe(c); // done → stable
  });

  it("crosses an empty gap of months in one step (no loader thrash)", () => {
    const recent = spaced(30, 0.2);
    const old = desc(Array.from({ length: 30 }, (_, i) => NOW - 400 * DAY_MS - i * DAY_MS));
    const ts = desc([...recent, ...old]);
    const c = initialCutoff(ts, NOW);
    const next = extendCutoff(ts, c);
    expect(countWithin(ts, next)).toBeGreaterThanOrEqual(countWithin(ts, c) + 12);
  });
});

describe("windowSections", () => {
  const n = (id: string, ts: number) => ({ id, title: id, createdAt: ts, updatedAt: ts }) as NoteMeta;
  const sections: GallerySection[] = [
    { key: "starred", label: "Starred", short: "Starred", notes: [n("s", 1)] },
    { key: "today", label: "Today", short: "Today", notes: [n("a", 100), n("b", 90)] },
    { key: "m-old", label: "Jan", short: "Jan", notes: [n("c", 50), n("d", 10)] },
  ];

  it("drops cards older than the cutoff and empty sections; untouched sections keep identity", () => {
    const out = windowSections(sections, 60, (x) => x.createdAt);
    expect(out.map((s) => s.key)).toEqual(["today"]);
    expect(out[0]).toBe(sections[1]);
    const partial = windowSections(sections, 20, (x) => x.createdAt);
    expect(partial.map((s) => [s.key, s.notes.map((x) => x.id)])).toEqual([
      ["today", ["a", "b"]],
      ["m-old", ["c"]],
    ]);
  });
});

describe("unloading far sections", () => {
  it("stamps the moment a section goes far, once; near clears it", () => {
    const far: FarSince = new Map();
    markVisibility(far, "a", false, 1000);
    markVisibility(far, "a", false, 5000); // still far — the clock is NOT reset
    expect(far.get("a")).toBe(1000);
    markVisibility(far, "a", true, 6000);
    expect(far.has("a")).toBe(false);
  });

  it("collapses only after 3 minutes far, and only once", () => {
    const far: FarSince = new Map([["a", 0], ["b", 100_000]]);
    expect(dueToCollapse(far, new Map(), 179_999)).toEqual([]);
    expect(dueToCollapse(far, new Map(), 180_000)).toEqual(["a"]);
    expect(dueToCollapse(far, new Map([["a", 400]]), 300_000)).toEqual(["b"]);
  });
});
