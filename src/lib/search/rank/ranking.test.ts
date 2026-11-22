// The ranking suite: what the owner sees first for a typed query. Runs the REAL runSearch +
// MemoryIndex so the whole path (plan → index → ranker → order) is locked in.
import { describe, it, expect } from "vitest";
import { hasSearchableText, runSearch } from "../search";
import { MemoryIndex } from "../indexer";
import { planQuery } from "./queryPlan";
import type { NoteMeta } from "../../types";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 22).getTime();

interface Fixture {
  id: string;
  title: string;
  body?: string;
  daysAgo?: number;
  tags?: string[];
  starred?: boolean;
}

function search(fixtures: Fixture[], text: string): string[] {
  const notes = fixtures.map(
    (f): NoteMeta => ({
      id: f.id,
      title: f.title,
      createdAt: NOW - (f.daysAgo ?? 0) * DAY,
      updatedAt: NOW - (f.daysAgo ?? 0) * DAY,
      tags: f.tags ?? [],
      categories: [],
      starred: f.starred,
    }),
  );
  const index = new MemoryIndex();
  index.set(fixtures.map((f) => ({ id: f.id, text: `${f.title}\n${f.body ?? ""}` })));
  return runSearch(notes, { text, items: [] }, index).notes.map((n) => n.id);
}

describe("ranking — the owner's case", () => {
  const vault: Fixture[] = [
    { id: "recent-partial", title: "Groceries", body: "I need milk and eggs today.", daysAgo: 0 },
    { id: "body-phrase", title: "Morning pages", body: "So, what do I want today? Mostly quiet.", daysAgo: 1 },
    { id: "title-phrase", title: "Monday: what do I want today and this week", daysAgo: 30 },
    { id: "the-one", title: "What do I want today", body: "Ship the search fix.", daysAgo: 400 },
    { id: "words-only", title: "Want list", body: "today, maybe tomorrow", daysAgo: 2 },
    { id: "only-stopwords", title: "What I do", body: "what do I do when I do it", daysAgo: 0 },
  ];

  it('"What do I want today" puts the memory with that title first, then by tier', () => {
    expect(search(vault, "What do I want today")).toEqual([
      "the-one", // exact title, even though 400 days old
      "title-phrase", // phrase in title
      "body-phrase", // phrase in body
      "words-only", // all the words, scattered
      "recent-partial", // only "today" — newest, still last
    ]);
  });

  it("stop words and one-letter words never match alone — such text filters and ranks nothing", () => {
    const inputOrder = vault.map((f) => f.id);
    expect(hasSearchableText("what do I")).toBe(false);
    expect(hasSearchableText("I")).toBe(false);
    expect(search(vault, "what do I")).toEqual(inputOrder);
    expect(search(vault, "I")).toEqual(inputOrder);
  });

  it("matches the title exactly while its last word is still being typed", () => {
    expect(search(vault, "What do I want tod")[0]).toBe("the-one");
  });

  it("is case- and punctuation-insensitive", () => {
    expect(search(vault, "WHAT, do i want... today?!")[0]).toBe("the-one");
  });
});

describe("ranking — tiers and weights", () => {
  it("full phrase in the body beats the words scattered in the body", () => {
    const ids = search(
      [
        { id: "scattered", title: "Notes", body: "the walk was long; a morning chill", daysAgo: 0 },
        { id: "phrase", title: "Notes", body: "a long morning walk", daysAgo: 9 },
      ],
      "morning walk",
    );
    expect(ids).toEqual(["phrase", "scattered"]);
  });

  it("all words present beats partial matches, whatever the date", () => {
    const ids = search(
      [
        { id: "partial", title: "Garden", body: "garden plans", daysAgo: 0 },
        { id: "all", title: "Old", body: "garden budget review", daysAgo: 300 },
      ],
      "garden budget",
    );
    expect(ids).toEqual(["all", "partial"]);
  });

  it("a word in the title weighs more than the same word in the body", () => {
    const ids = search(
      [
        { id: "body", title: "Weekly review", body: "about the budget and taxes", daysAgo: 0 },
        { id: "title", title: "Budget", body: "weekly taxes", daysAgo: 50 },
      ],
      "budget taxes",
    );
    expect(ids).toEqual(["title", "body"]);
  });

  it("a tag counts as a match, below the title", () => {
    const ids = search(
      [
        { id: "tagged", title: "Lunch", tags: ["#focus"], daysAgo: 0 },
        { id: "titled", title: "Focus session", daysAgo: 20 },
      ],
      "focus",
    );
    expect(ids).toEqual(["titled", "tagged"]);
  });

  it("a whole word beats a prefix of a longer word", () => {
    const ids = search(
      [
        { id: "prefix", title: "Walking", daysAgo: 0 },
        { id: "word", title: "Walk", daysAgo: 10 },
      ],
      "walk",
    );
    expect(ids).toEqual(["word", "prefix"]);
  });

  it("transcript text folded into the body counts as body", () => {
    const ids = search([{ id: "voice", title: "", body: "spoken: remember the lighthouse trip" }], "lighthouse trip");
    expect(ids).toEqual(["voice"]);
  });

  it("recency only breaks ties", () => {
    const ids = search(
      [
        { id: "old", title: "Journal", body: "a quiet harbour", daysAgo: 90 },
        { id: "new", title: "Journal", body: "a quiet harbour", daysAgo: 1 },
      ],
      "harbour",
    );
    expect(ids).toEqual(["new", "old"]);
  });

  it("a starred memory leads its own tier but never jumps a better one", () => {
    const ids = search(
      [
        { id: "exact", title: "Harbour", daysAgo: 100 },
        { id: "plain", title: "Journal", body: "harbour", daysAgo: 0 },
        { id: "star", title: "Journal", body: "harbour", daysAgo: 50, starred: true },
      ],
      "harbour",
    );
    expect(ids).toEqual(["exact", "star", "plain"]);
  });

  it("a word matches the words it starts, not ones it sits inside", () => {
    const ids = search(
      [
        { id: "starts", title: "Summoning", daysAgo: 0 },
        { id: "inside", title: "Consummate", daysAgo: 0 },
      ],
      "summ",
    );
    expect(ids).toEqual(["starts"]);
  });
});

describe("planQuery", () => {
  it("keeps every token in the phrase but only matchable ones as terms", () => {
    expect(planQuery("What do I want today?")).toEqual({ phrase: " what do i want today", terms: ["want", "today"] });
  });

  it("drops duplicate terms and empty input", () => {
    expect(planQuery("walk walk").terms).toEqual(["walk"]);
    expect(planQuery("  ")).toEqual({ phrase: "", terms: [] });
  });
});
