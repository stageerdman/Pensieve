import { describe, it, expect } from "vitest";
import { parseDetectedDate } from "./parseDetectedDate";

const NOW = new Date(2026, 10, 9); // Nov 9, 2026 (months are 0-indexed)

describe("parseDetectedDate", () => {
  it("empty/missing label falls back to now", () => {
    expect(parseDetectedDate(null, NOW)).toBe(NOW.getTime());
    expect(parseDetectedDate(undefined, NOW)).toBe(NOW.getTime());
    expect(parseDetectedDate("", NOW)).toBe(NOW.getTime());
  });

  it("month-first, no year, in the past this year", () => {
    expect(parseDetectedDate("Nov 3", NOW)).toBe(new Date(2026, 10, 3).getTime());
  });

  it("full month name + ordinal suffix", () => {
    expect(parseDetectedDate("November 3rd", NOW)).toBe(new Date(2026, 10, 3).getTime());
  });

  it("a weekday prefix doesn't confuse the month/day match", () => {
    expect(parseDetectedDate("Mon Nov 3", NOW)).toBe(new Date(2026, 10, 3).getTime());
  });

  it("day-first order ('3 Nov')", () => {
    expect(parseDetectedDate("3 Nov", NOW)).toBe(new Date(2026, 10, 3).getTime());
  });

  it("a bare month/day that's still in the FUTURE this year rolls back to last year", () => {
    // "Dec 25" relative to "now" = Nov 9, 2026 would be in the future this year.
    expect(parseDetectedDate("Dec 25", NOW)).toBe(new Date(2025, 11, 25).getTime());
  });

  it("an explicit year is trusted even if that lands in the future", () => {
    expect(parseDetectedDate("Nov 3, 2027", NOW)).toBe(new Date(2027, 10, 3).getTime());
  });

  it("ISO date with explicit year", () => {
    expect(parseDetectedDate("2026-11-03", NOW)).toBe(new Date(2026, 10, 3).getTime());
  });

  it("unparseable gibberish falls back to now rather than throwing", () => {
    expect(parseDetectedDate("asdkfj not a date", NOW)).toBe(NOW.getTime());
  });
});
