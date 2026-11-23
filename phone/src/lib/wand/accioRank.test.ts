import { describe, it, expect } from "vitest";
import { rankNotes } from "./accioRank";

describe("rankNotes", () => {
  it("empty query returns everything, original order (a copy)", () => {
    const notes = [{ id: 1, t: "A", c: "" }, { id: 2, t: "B", c: "" }];
    const out = rankNotes(notes, "");
    expect(out).toEqual(notes);
    expect(out).not.toBe(notes); // a copy, not the same array
  });

  it("ranks title-starts-with > title-contains > body-contains", () => {
    const notes = [
      { id: 1, t: "A trip to the lighthouse", c: "nothing" }, // title-contains → s=1
      { id: 2, t: "Random note", c: "we saw a lighthouse on the trip" }, // body-contains → s=2
      { id: 3, t: "Lighthouse keeper", c: "" }, // title-starts-with → s=0
      { id: 4, t: "Nothing relevant", c: "no match here" }, // filtered out
    ];
    const out = rankNotes(notes, "lighthouse");
    expect(out.map((d) => d.id)).toEqual([3, 1, 2]);
  });

  it("form: keeps only forms — alone or with text", () => {
    const notes: { id: number; t: string; c: string; foreign: { extra: Record<string, string> } }[] = [
      { id: 1, t: "Daily review", c: "", foreign: { extra: { form: "true" } } },
      { id: 2, t: "Daily review — Mon", c: "", foreign: { extra: { fromForm: "1" } } },
      { id: 3, t: "Trip log", c: "", foreign: { extra: { form: "true" } } },
    ];
    expect(rankNotes(notes, "form: ").map((d) => d.id)).toEqual([1, 3]);
    expect(rankNotes(notes, "form: daily").map((d) => d.id)).toEqual([1]);
  });

  it("ties within the same relevance tier break on original index", () => {
    const notes = [
      { id: 1, t: "Lighthouse A", c: "" },
      { id: 2, t: "Lighthouse B", c: "" }, // both title-starts-with → tie → keep index order
    ];
    const out = rankNotes(notes, "lighthouse");
    expect(out.map((d) => d.id)).toEqual([1, 2]);
  });

  it("a bare 'recent' query (no text) sorts by most-recently-opened first", () => {
    const notes = [{ id: 1 }, { id: 2 }, { id: 3 }];
    // openedOrder: 2 opened first, then 1, then 3 (last = most recent).
    const openedOrder = [2, 1, 3];
    const out = rankNotes(notes, "recent", openedOrder);
    expect(out.map((d) => d.id)).toEqual([3, 1, 2]);
  });

  it("date filters still apply alongside text ranking", () => {
    const notes = [
      { id: 1, t: "Lighthouse plan", c: "", created: "Today" },
      { id: 2, t: "Lighthouse notes", c: "", created: "Jan 3" },
    ];
    const out = rankNotes(notes, "lighthouse today");
    expect(out.map((d) => d.id)).toEqual([1]);
  });
});
