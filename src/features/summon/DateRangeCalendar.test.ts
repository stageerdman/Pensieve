import { describe, it, expect } from "vitest";
import { formatRange } from "./DateRangeCalendar";

const NOW = new Date(2026, 1, 18).getTime();
const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe("formatRange", () => {
  it("a single day", () => {
    expect(formatRange(at(2026, 0, 3), at(2026, 0, 3), NOW)).toBe("Jan 3");
  });

  it("a same-month range drops the repeated month on the right", () => {
    expect(formatRange(at(2026, 0, 3), at(2026, 0, 18), NOW)).toBe("Jan 3 – 18");
  });

  it("a cross-month range in the current year keeps both months", () => {
    expect(formatRange(at(2026, 0, 3), at(2026, 1, 2), NOW)).toBe("Jan 3 – Feb 2");
  });

  it("adds a 2-digit year when the range isn't in the current year", () => {
    const s = formatRange(at(2025, 11, 30), at(2026, 0, 5), NOW);
    expect(s).toContain("Dec 30 '25");
    expect(s).toContain("Jan 5 '26");
  });
});
