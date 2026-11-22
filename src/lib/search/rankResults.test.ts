import { describe, it, expect } from "vitest";
import { rankResults } from "./rankResults";
import type { SearchResult } from "./search";
import type { NoteMeta } from "../types";

const n = (id: string, updatedAt: number, starred = false): NoteMeta => ({
  id,
  title: id,
  createdAt: updatedAt,
  updatedAt,
  excerpt: "",
  starred,
});
const r = (id: string, where: SearchResult["where"], rank: number): SearchResult => ({ id, where, snippet: null, rank });

const order = (notes: NoteMeta[], results: SearchResult[]) =>
  rankResults({ notes, match: new Map(results.map((x) => [x.id, x])) }).notes.map((x) => x.id);

describe("rankResults (interim order)", () => {
  it("title beats tag beats body, regardless of recency", () => {
    expect(
      order(
        [n("body", 30), n("tag", 20), n("title", 10)],
        [r("body", "text", 2), r("tag", "tag", 1), r("title", "title", 0)],
      ),
    ).toEqual(["title", "tag", "body"]);
  });

  it("a starred text match rises above everything", () => {
    expect(
      order([n("title", 10), n("star", 1, true)], [r("title", "title", 0), r("star", "text", 2)]),
    ).toEqual(["star", "title"]);
  });

  it("equal strength → most recently updated first, then id", () => {
    expect(
      order([n("old", 1), n("b", 5), n("a", 5)], [r("old", "title", 0), r("b", "title", 0), r("a", "title", 0)]),
    ).toEqual(["a", "b", "old"]);
  });

  it("filter-only (chip) results don't lift starred and sort by recency", () => {
    expect(order([n("star", 1, true), n("fresh", 9)], [r("star", null, 3), r("fresh", null, 3)])).toEqual([
      "fresh",
      "star",
    ]);
  });
});
