import { describe, it, expect } from "vitest";
import { resolveYearPlaceholders } from "./resolveYearPlaceholders";

const NOW = new Date(2026, 10, 9); // Nov 9, 2026

describe("resolveYearPlaceholders", () => {
  it("no page has an explicit year → every placeholder becomes the current real year", () => {
    const out = resolveYearPlaceholders(["18 October YYYY", "19 October YYYY", null], NOW);
    expect(out).toEqual(["18 October 2026", "19 October 2026", null]);
  });

  it("one page has an explicit year → it propagates to every placeholder in the batch", () => {
    const out = resolveYearPlaceholders(["18 October YYYY", "20 October 2024", "21 October YYYY"], NOW);
    expect(out).toEqual(["18 October 2024", "20 October 2024", "21 October 2024"]);
  });

  it("the year doesn't have to be on the first page — still resolves pages BEFORE it in the array", () => {
    // the owner's exact scenario: "it's not always the first page that has the date"
    const out = resolveYearPlaceholders(["1 January YYYY", "2 January YYYY", "3 January 2025"], NOW);
    expect(out).toEqual(["1 January 2025", "2 January 2025", "3 January 2025"]);
  });

  it("multiple distinct explicit years → the most-seen one wins", () => {
    const out = resolveYearPlaceholders(["1 Jan 2024", "2 Jan 2024", "3 Jan 2025", "4 Jan YYYY"], NOW);
    expect(out[3]).toBe("4 Jan 2024");
    // pages that already had their OWN explicit year keep it even if it's the minority
    expect(out[2]).toBe("3 Jan 2025");
  });

  it("a tie between two distinct years keeps whichever appears FIRST", () => {
    const out = resolveYearPlaceholders(["1 Jan 2025", "2 Jan 2024", "3 Jan YYYY"], NOW);
    expect(out[2]).toBe("3 Jan 2025");
  });

  it("pages with no date header at all (null) pass through untouched", () => {
    expect(resolveYearPlaceholders([null, null], NOW)).toEqual([null, null]);
  });

  it("an empty batch is a no-op", () => {
    expect(resolveYearPlaceholders([], NOW)).toEqual([]);
  });

  it("a header with the placeholder appearing more than once replaces every occurrence", () => {
    const out = resolveYearPlaceholders(["YYYY-born, written in YYYY"], NOW);
    expect(out[0]).toBe("2026-born, written in 2026");
  });
});
