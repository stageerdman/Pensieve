import { describe, it, expect } from "vitest";
import { resolveDatePhrase } from "./dates";

// Anchor: Wednesday 18 Feb 2026, 12:00 local. Mid-week so Monday-week-start is exercised,
// and February so "last month" must resolve to all of January (calendar-correct).
const NOW = new Date(2026, 1, 18, 12, 0, 0, 0).getTime();
const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0, ms = 0) =>
  new Date(y, m, d, h, mi, s, ms).getTime();
const endOf = (y: number, m: number, d: number) => at(y, m, d, 23, 59, 59, 999);

describe("resolveDatePhrase", () => {
  it("today / yesterday / today or yesterday", () => {
    expect(resolveDatePhrase("today", NOW)!.range).toEqual({
      start: at(2026, 1, 18),
      end: endOf(2026, 1, 18),
    });
    expect(resolveDatePhrase("yesterday", NOW)!.range).toEqual({
      start: at(2026, 1, 17),
      end: endOf(2026, 1, 17),
    });
    expect(resolveDatePhrase("today or yesterday", NOW)!.range).toEqual({
      start: at(2026, 1, 17),
      end: endOf(2026, 1, 18),
    });
  });

  it("this week / last week (Monday start)", () => {
    // Week of Wed Feb 18 starts Mon Feb 16.
    expect(resolveDatePhrase("this week", NOW)!.range).toEqual({
      start: at(2026, 1, 16),
      end: endOf(2026, 1, 18),
    });
    // Previous week: Mon Feb 9 .. Sun Feb 15.
    expect(resolveDatePhrase("last week", NOW)!.range).toEqual({
      start: at(2026, 1, 9),
      end: endOf(2026, 1, 15),
    });
  });

  it("this month / last month (calendar-correct: Feb -> all of Jan)", () => {
    expect(resolveDatePhrase("this month", NOW)!.range).toEqual({
      start: at(2026, 1, 1),
      end: endOf(2026, 1, 18),
    });
    expect(resolveDatePhrase("last month", NOW)!.range).toEqual({
      start: at(2026, 0, 1),
      end: endOf(2026, 0, 31),
    });
  });

  it("this year / last year", () => {
    expect(resolveDatePhrase("this year", NOW)!.range).toEqual({
      start: at(2026, 0, 1),
      end: endOf(2026, 1, 18),
    });
    expect(resolveDatePhrase("last year", NOW)!.range).toEqual({
      start: at(2025, 0, 1),
      end: endOf(2025, 11, 31),
    });
  });

  it("rolling last N days (N days including today)", () => {
    // last 7 days = Feb 12 .. Feb 18
    expect(resolveDatePhrase("last 7 days", NOW)!.range).toEqual({
      start: at(2026, 1, 12),
      end: endOf(2026, 1, 18),
    });
    // last 30 days = Jan 20 .. Feb 18
    expect(resolveDatePhrase("last 30 days", NOW)!.range).toEqual({
      start: at(2026, 0, 20),
      end: endOf(2026, 1, 18),
    });
    expect(resolveDatePhrase("past 1 day", NOW)!.range).toEqual({
      start: at(2026, 1, 18),
      end: endOf(2026, 1, 18),
    });
  });

  it("rolling last N weeks / months", () => {
    // last 2 weeks = 14 days incl today = Feb 5 .. Feb 18
    expect(resolveDatePhrase("last 2 weeks", NOW)!.range).toEqual({
      start: at(2026, 1, 5),
      end: endOf(2026, 1, 18),
    });
    // last 3 months = start of Dec 2025 .. Feb 18 2026
    expect(resolveDatePhrase("last 3 months", NOW)!.range).toEqual({
      start: at(2025, 11, 1),
      end: endOf(2026, 1, 18),
    });
  });

  it("last <weekday> → the most recent past occurrence (never today)", () => {
    // NOW is Wed 18 Feb 2026.
    expect(resolveDatePhrase("last sunday", NOW)!.range).toEqual({
      start: at(2026, 1, 15), // Sun 15 Feb
      end: endOf(2026, 1, 15),
    });
    expect(resolveDatePhrase("last wednesday", NOW)!.range).toEqual({
      start: at(2026, 1, 11), // previous Wed, not today
      end: endOf(2026, 1, 11),
    });
    expect(resolveDatePhrase("last monday", NOW)!.range).toEqual({
      start: at(2026, 1, 16), // Mon 16 Feb
      end: endOf(2026, 1, 16),
    });
  });

  it("is case/space insensitive and labels canonically", () => {
    const r = resolveDatePhrase("  Last   Month ", NOW)!;
    expect(r.label).toBe("last month");
    expect(r.range.start).toBe(at(2026, 0, 1));
  });

  it("returns null for non-date phrases", () => {
    expect(resolveDatePhrase("weekly review", NOW)).toBeNull();
    expect(resolveDatePhrase("#bug", NOW)).toBeNull();
    expect(resolveDatePhrase("last 0 days", NOW)).toBeNull();
    expect(resolveDatePhrase("", NOW)).toBeNull();
  });
});
