import { describe, it, expect } from "vitest";
import { matchFilter, matchTree, normTag, type SearchableNote } from "./evaluate";
import type { FilterLeaf, FilterGroup } from "./types";

const NOW = new Date(2026, 1, 18, 12).getTime();
const DAY = 86_400_000;

const note = (over: Partial<SearchableNote> = {}): SearchableNote => ({
  id: "n1",
  title: "Weekly Review — February",
  tags: ["#Weekly Review", "#planning"],
  categories: ["Notes & Lessons"],
  createdAt: new Date(2026, 0, 20, 9).getTime(), // Jan 20
  updatedAt: NOW,
  pinned: false,
  body: "Shipped the summon bar. Felt calm after the morning walk.",
  ...over,
});

const leaf = (filter: FilterLeaf["filter"], id = "l"): FilterLeaf => ({ type: "leaf", id, filter });

describe("normTag", () => {
  it("strips #, trims, lowercases", () => {
    expect(normTag("#Weekly Review")).toBe("weekly review");
    expect(normTag("  Bug ")).toBe("bug");
  });
});

describe("matchFilter", () => {
  it("tag is a one-of set, #-insensitive", () => {
    expect(matchFilter({ kind: "tag", tags: ["#weekly review"] }, note())).toBe(true);
    expect(matchFilter({ kind: "tag", tags: ["Bug", "weekly review"] }, note())).toBe(true);
    expect(matchFilter({ kind: "tag", tags: ["#bug"] }, note())).toBe(false);
  });

  it("category is case-insensitive one-of", () => {
    expect(matchFilter({ kind: "category", categories: ["notes & lessons"] }, note())).toBe(true);
    expect(matchFilter({ kind: "category", categories: ["Execution"] }, note())).toBe(false);
  });

  it("date ranges over the chosen field, inclusive", () => {
    const jan = { start: new Date(2026, 0, 1).getTime(), end: new Date(2026, 0, 31, 23, 59, 59, 999).getTime() };
    expect(matchFilter({ kind: "date", field: "created", range: jan, phrase: "last month" }, note())).toBe(true);
    // updatedAt is NOW (Feb), so a January "updated" range should miss.
    expect(matchFilter({ kind: "date", field: "updated", range: jan, phrase: "last month" }, note())).toBe(false);
    // boundary: exactly at end is included
    const n = note({ createdAt: jan.end });
    expect(matchFilter({ kind: "date", field: "created", range: jan, phrase: "x" }, n)).toBe(true);
    expect(matchFilter({ kind: "date", field: "created", range: jan, phrase: "x" }, note({ createdAt: jan.end + 1 }))).toBe(false);
  });

  it("flag pinned", () => {
    expect(matchFilter({ kind: "flag", flag: "pinned" }, note({ pinned: true }))).toBe(true);
    expect(matchFilter({ kind: "flag", flag: "pinned" }, note({ pinned: false }))).toBe(false);
  });

  it("title substring", () => {
    expect(matchFilter({ kind: "title", text: "weekly" }, note())).toBe(true);
    expect(matchFilter({ kind: "title", text: "march" }, note())).toBe(false);
  });

  it("text searches title + tags + body", () => {
    expect(matchFilter({ kind: "text", text: "summon" }, note())).toBe(true); // body
    expect(matchFilter({ kind: "text", text: "planning" }, note())).toBe(true); // tag
    expect(matchFilter({ kind: "text", text: "february" }, note())).toBe(true); // title
    expect(matchFilter({ kind: "text", text: "nonexistent" }, note())).toBe(false);
    // body absent -> still matches on title/tags
    expect(matchFilter({ kind: "text", text: "summon" }, note({ body: undefined }))).toBe(false);
  });
});

describe("matchTree", () => {
  const tagWeekly = leaf({ kind: "tag", tags: ["#Weekly Review"] }, "a");
  const tagBug = leaf({ kind: "tag", tags: ["#Bug"] }, "b");
  const pinned = leaf({ kind: "flag", flag: "pinned" }, "c");

  it("top-level items are AND", () => {
    // weekly AND pinned -> note is not pinned
    expect(matchTree([tagWeekly, pinned], note())).toBe(false);
    expect(matchTree([tagWeekly, pinned], note({ pinned: true }))).toBe(true);
  });

  it("an OR group: (#Weekly OR #Bug)", () => {
    const group: FilterGroup = { type: "group", id: "g", relation: "or", children: [tagWeekly, tagBug] };
    expect(matchTree([group], note())).toBe(true); // has weekly
    expect(matchTree([group], note({ tags: ["#Bug"] }))).toBe(true);
    expect(matchTree([group], note({ tags: ["#other"] }))).toBe(false);
  });

  it("nested: (#Weekly OR #Bug) AND pinned, as a group AND a leaf", () => {
    const orGroup: FilterGroup = { type: "group", id: "g", relation: "or", children: [tagWeekly, tagBug] };
    expect(matchTree([orGroup, pinned], note({ tags: ["#Bug"], pinned: true }))).toBe(true);
    expect(matchTree([orGroup, pinned], note({ tags: ["#Bug"], pinned: false }))).toBe(false);
  });

  it("nested group within a group (depth 2)", () => {
    // outer AND: [ (#Weekly OR #Bug), pinned ]  nested inside an OR with a lone date leaf
    const inner: FilterGroup = { type: "group", id: "g1", relation: "or", children: [tagWeekly, tagBug] };
    const outer: FilterGroup = { type: "group", id: "g2", relation: "and", children: [inner, pinned] };
    expect(matchTree([outer], note({ tags: ["#Bug"], pinned: true }))).toBe(true);
    expect(matchTree([outer], note({ tags: ["#Bug"], pinned: false }))).toBe(false);
    expect(matchTree([outer], note({ tags: ["#x"], pinned: true }))).toBe(false);
  });

  it("empty items match everything", () => {
    expect(matchTree([], note())).toBe(true);
  });

  void DAY;
});
