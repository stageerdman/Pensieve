import { describe, it, expect } from "vitest";
import { relativeTime, absoluteDate } from "./format";

const NOW = new Date(2026, 9, 4, 12, 0, 0).getTime(); // 2026-10-04 12:00
const DAY = 86_400_000;

describe("relativeTime", () => {
  it("renders calm relative labels", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now");
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
    expect(relativeTime(NOW - DAY, NOW)).toBe("yesterday");
    expect(relativeTime(NOW - 4 * DAY, NOW)).toBe("4d ago");
  });
});

describe("absoluteDate", () => {
  it("shows month+day for the current year", () => {
    expect(absoluteDate(new Date(2026, 9, 3).getTime(), NOW)).toBe("Oct 3");
  });
  it("adds a 2-digit year for other years", () => {
    expect(absoluteDate(new Date(2025, 8, 28).getTime(), NOW)).toBe("Sep 28 '25");
  });
});
