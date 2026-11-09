import { describe, it, expect } from "vitest";
import { splitByDate, sharesBoundary, type PageSignal } from "./splitAlgorithm";

const p = (ref: string, dateHeader: string | null, continuesPrevious?: boolean): PageSignal => ({
  ref,
  dateHeader,
  ...(continuesPrevious ? { continuesPrevious } : {}),
});

describe("splitByDate", () => {
  it("empty batch → no groups", () => {
    expect(splitByDate([])).toEqual([]);
  });

  it("a single date, several pages, no header repeats → one group with all pages in order", () => {
    const pages = [p("p1", "Nov 3"), p("p2", null), p("p3", null)];
    expect(splitByDate(pages)).toEqual([{ date: "Nov 3", pages: ["p1", "p2", "p3"] }]);
  });

  it("a clean new-date start (no shared boundary) opens a fresh group, previous group untouched", () => {
    const pages = [p("p1", "Nov 3"), p("p2", null), p("p3", "Nov 4"), p("p4", null)];
    expect(splitByDate(pages)).toEqual([
      { date: "Nov 3", pages: ["p1", "p2"] },
      { date: "Nov 4", pages: ["p3", "p4"] },
    ]);
  });

  it("a shared boundary page (end of one day + start of the next on one photo) is referenced by BOTH groups, not torn in half", () => {
    const pages = [p("p1", "Nov 3"), p("p2", "Nov 4", true), p("p3", null)];
    const groups = splitByDate(pages);
    expect(groups).toEqual([
      { date: "Nov 3", pages: ["p1", "p2"] },
      { date: "Nov 4", pages: ["p2", "p3"] },
    ]);
    expect(sharesBoundary(groups, 0)).toBe(true);
  });

  it("three dates with one shared boundary in the middle and a clean cut on the other side", () => {
    const pages = [
      p("p1", "Nov 3"),
      p("p2", null),
      p("p3", "Nov 4", true), // shares with Nov 3 — Nov 3's entry ends on p3
      p("p4", "Nov 5"), // a CLEAN cut — Nov 4's entry is just p3 alone
      p("p5", null),
    ];
    const groups = splitByDate(pages);
    expect(groups).toEqual([
      { date: "Nov 3", pages: ["p1", "p2", "p3"] },
      { date: "Nov 4", pages: ["p3"] },
      { date: "Nov 5", pages: ["p4", "p5"] },
    ]);
    expect(sharesBoundary(groups, 0)).toBe(true); // Nov 3 / Nov 4 share p3
    expect(sharesBoundary(groups, 1)).toBe(false); // Nov 4 / Nov 5 cut cleanly
  });

  it("first-page exception: a leading date header on page 1 starts group one there — there is no 'before' group to share with, even if continuesPrevious is (incorrectly) set", () => {
    // Models "[junk text] DATE [entry]" on page 1 — upstream extraction already collapses
    // the junk away, so the signal is just the real date header. continuesPrevious=true on
    // page 1 is meaningless (nothing precedes it) and must be ignored, not crash or leak.
    const pages = [p("p1", "Nov 3", true), p("p2", null)];
    expect(splitByDate(pages)).toEqual([{ date: "Nov 3", pages: ["p1", "p2"] }]);
  });

  it("no header anywhere (AI failed to read page 1) → an undated leading group, no page dropped", () => {
    const pages = [p("p1", null), p("p2", null)];
    expect(splitByDate(pages)).toEqual([{ date: null, pages: ["p1", "p2"] }]);
  });

  it("an undated leading run followed by a real date header still closes cleanly", () => {
    const pages = [p("p1", null), p("p2", "Nov 3")];
    expect(splitByDate(pages)).toEqual([
      { date: null, pages: ["p1"] },
      { date: "Nov 3", pages: ["p2"] },
    ]);
  });
});

describe("sharesBoundary", () => {
  it("false for the last group (no next group) and out-of-range indices", () => {
    const groups = splitByDate([p("p1", "Nov 3"), p("p2", "Nov 4")]);
    expect(sharesBoundary(groups, 0)).toBe(false); // clean cut, p1 !== p2's first page
    expect(sharesBoundary(groups, 1)).toBe(false); // no groups[2]
    expect(sharesBoundary(groups, 5)).toBe(false);
  });
});
