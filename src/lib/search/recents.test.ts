import { describe, it, expect, beforeEach } from "vitest";
import { loadRecents, saveRecents, addRecent, matchRecents } from "./recents";

describe("recents — add (dedupe, cap, recency)", () => {
  it("adds to the front, most-recent-first", () => {
    let list: string[] = [];
    list = addRecent(list, "last 7 days");
    list = addRecent(list, "#health");
    expect(list).toEqual(["#health", "last 7 days"]);
  });

  it("de-dupes case-insensitively and moves a re-run to the top", () => {
    let list = addRecent(addRecent([], "Last 7 Days"), "#health");
    list = addRecent(list, "last 7 days"); // same query, different case
    expect(list).toEqual(["last 7 days", "#health"]);
  });

  it("ignores queries shorter than 2 chars and returns the same reference", () => {
    const list = ["last 7 days"];
    expect(addRecent(list, " ")).toBe(list);
    expect(addRecent(list, "a")).toBe(list);
  });

  it("returns the same reference when the query is already at the front", () => {
    const list = addRecent([], "pinned");
    expect(addRecent(list, "pinned")).toBe(list);
  });

  it("normalizes whitespace", () => {
    expect(addRecent([], "  last   7   days ")).toEqual(["last 7 days"]);
  });

  it("caps the rolling buffer", () => {
    let list: string[] = [];
    for (let i = 0; i < 40; i++) list = addRecent(list, `q${i}`);
    expect(list.length).toBe(25);
    expect(list[0]).toBe("q39"); // newest kept
    expect(list.includes("q14")).toBe(false); // oldest dropped
  });
});

describe("recents — match (prefix fit, recency, echo suppression)", () => {
  const list = ["last 7 days", "last month", "#health", "morning pages"];

  it("returns prefix-fitting recents in recency order", () => {
    expect(matchRecents(list, "last", 5)).toEqual(["last 7 days", "last month"]);
  });

  it("excludes non-fitting queries (the 'late' vs 'las' rule)", () => {
    expect(matchRecents(list, "late", 5)).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(matchRecents(list, "LAST M", 5)).toEqual(["last month"]);
  });

  it("returns the most recent `limit` for an empty input", () => {
    expect(matchRecents(list, "", 2)).toEqual(["last 7 days", "last month"]);
  });

  it("suppresses an exact echo of what's already typed", () => {
    expect(matchRecents(list, "last 7 days", 5)).toEqual([]); // the one exact match is dropped
    expect(matchRecents(list, "last", 5)).toContain("last 7 days"); // but a prefix keeps it
  });

  it("respects the limit", () => {
    expect(matchRecents(["aa", "ab", "ac"], "a", 2)).toEqual(["aa", "ab"]);
  });
});

describe("recents — persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips through localStorage", () => {
    saveRecents(["last 7 days", "#health"]);
    expect(loadRecents()).toEqual(["last 7 days", "#health"]);
  });

  it("returns [] when nothing stored or the value is corrupt", () => {
    expect(loadRecents()).toEqual([]);
    localStorage.setItem("pensieve.recentSearches", "{not json");
    expect(loadRecents()).toEqual([]);
  });
});
