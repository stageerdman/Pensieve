import { describe, it, expect } from "vitest";
import { linearPartition, rowCountForHeight, justifyGallery } from "./galleryJustify";

describe("linearPartition", () => {
  it("splits into exactly k contiguous, order-preserving groups", () => {
    // [1,2,3,4,5] into 2 → the balanced contiguous split is [1,2,3,4] | [5]? No: minimise max sum.
    // sums: [1,2,3] (6) | [4,5] (9) → max 9; [1,2,3,4](10)|[5](5)→10; [1,2](3)|[3,4,5](12)→12.
    // best is [1,2,3,4,5]→ [0,1,2]|[3,4] with max 9.
    const g = linearPartition([1, 2, 3, 4, 5], 2);
    expect(g).toEqual([[0, 1, 2], [3, 4]]);
  });

  it("gives each item its own group when k >= n", () => {
    expect(linearPartition([3, 1, 4], 3)).toEqual([[0], [1], [2]]);
    expect(linearPartition([3, 1, 4], 9)).toEqual([[0], [1], [2]]);
  });

  it("one group when k = 1", () => {
    expect(linearPartition([3, 1, 4], 1)).toEqual([[0, 1, 2]]);
  });

  it("empty input → empty", () => {
    expect(linearPartition([], 3)).toEqual([]);
  });

  it("balances evenly-sized weights", () => {
    expect(linearPartition([10, 10, 10, 10], 2)).toEqual([[0, 1], [2, 3]]);
  });
});

describe("rowCountForHeight", () => {
  it("rounds height/targetRow, clamped to [1, maxRows] and image count", () => {
    expect(rowCountForHeight(220, 4, 220, 4, 10)).toBe(1); // ~1 row tall
    expect(rowCountForHeight(460, 4, 220, 4, 10)).toBe(2); // ~2 rows
    expect(rowCountForHeight(2000, 4, 220, 4, 10)).toBe(4); // clamped to maxRows
    expect(rowCountForHeight(2000, 4, 220, 4, 3)).toBe(3); // clamped to image count
    expect(rowCountForHeight(10, 4, 220, 4, 10)).toBe(1); // never < 1
    expect(rowCountForHeight(500, 4, 220, 4, 0)).toBe(1); // no images
  });
});

describe("justifyGallery", () => {
  it("scales every image to the shared row height, preserving aspect (width = aspect·rowH)", () => {
    // One row, height 200, gap 0: two images 2:1 and 1:1 → widths 400 and 200.
    const r = justifyGallery([2, 1], { containerHeight: 200, gap: 0, targetRowH: 200, maxRows: 4 });
    expect(r.rowCount).toBe(1);
    expect(r.rowH).toBe(200);
    expect(r.rows[0].tiles.map((t) => t.width)).toEqual([400, 200]);
    expect(r.rows[0].tiles.every((t) => t.height === 200)).toBe(true);
    expect(r.contentWidth).toBe(600);
  });

  it("derives the shared row height exactly from the row count + gaps", () => {
    // height 404, gap 4, targetRow 200 → 2 rows → rowH = (404 - 4)/2 = 200.
    const r = justifyGallery([1, 1, 1, 1], { containerHeight: 404, gap: 4, targetRowH: 200, maxRows: 4 });
    expect(r.rowCount).toBe(2);
    expect(r.rowH).toBe(200);
  });

  it("preserves original order across rows (reads left-to-right, top-to-bottom)", () => {
    const r = justifyGallery([1, 1, 1, 1], { containerHeight: 404, gap: 0, targetRowH: 200, maxRows: 4 });
    const order = r.rows.flatMap((row) => row.tiles.map((t) => t.index));
    expect(order).toEqual([0, 1, 2, 3]);
    expect(r.rows[0].tiles.map((t) => t.index)).toEqual([0, 1]);
    expect(r.rows[1].tiles.map((t) => t.index)).toEqual([2, 3]);
  });

  it("treats a missing/zero aspect as square until measured", () => {
    const r = justifyGallery([0, NaN], { containerHeight: 200, gap: 0, targetRowH: 200, maxRows: 1 });
    expect(r.rows[0].tiles.map((t) => t.width)).toEqual([200, 200]);
  });

  it("empty gallery → no rows", () => {
    const r = justifyGallery([], { containerHeight: 200, gap: 4, targetRowH: 200, maxRows: 4 });
    expect(r.rows).toEqual([]);
    expect(r.contentWidth).toBe(0);
  });
});
