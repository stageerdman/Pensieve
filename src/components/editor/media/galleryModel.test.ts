import { describe, it, expect } from "vitest";
import {
  galleryColumns,
  galleryLayout,
  reorderImages,
  removeImageAt,
  shapeForCount,
  planImageInsert,
  MAX_VISIBLE_TILES,
  type GalleryImage,
} from "./galleryModel";

const imgs = (n: number): GalleryImage[] => Array.from({ length: n }, (_, i) => ({ url: `u${i}` }));

describe("count-driven layout", () => {
  it("columns: 2→2, 3→3, 4→2 (2×2), 5–8→3, 9+→3", () => {
    expect(galleryColumns(2)).toBe(2);
    expect(galleryColumns(3)).toBe(3);
    expect(galleryColumns(4)).toBe(2);
    expect([5, 6, 7, 8].map(galleryColumns)).toEqual([3, 3, 3, 3]);
    expect(galleryColumns(12)).toBe(3);
  });

  it("shows all tiles up to the cap, then caps at 6 with a '+N more' cover", () => {
    expect(galleryLayout(3)).toMatchObject({ tilesShown: 3, hasOverflow: false, coverIndex: -1, overflowMore: 0 });
    expect(galleryLayout(6)).toMatchObject({ tilesShown: 6, hasOverflow: false, overflowMore: 0 });
    // 9 images → 6 tiles, the 6th a cover folding the 6th image + the 3 behind it = "+4".
    expect(galleryLayout(9)).toMatchObject({
      tilesShown: MAX_VISIBLE_TILES,
      hasOverflow: true,
      coverIndex: 5,
      overflowMore: 4,
    });
    expect(galleryLayout(12).overflowMore).toBe(7);
  });
});

describe("ordered-list edits (order == fence line order)", () => {
  it("reorders by moving one item (a reorder == a line reorder)", () => {
    const list = imgs(4);
    expect(reorderImages(list, 0, 2).map((i) => i.url)).toEqual(["u1", "u2", "u0", "u3"]);
    expect(reorderImages(list, 3, 0).map((i) => i.url)).toEqual(["u3", "u0", "u1", "u2"]);
  });
  it("is a no-op for equal / out-of-range indices", () => {
    const list = imgs(3);
    expect(reorderImages(list, 1, 1)).toBe(list);
    expect(reorderImages(list, -1, 2)).toBe(list);
    expect(reorderImages(list, 0, 9)).toBe(list);
  });
  it("removes by index", () => {
    expect(removeImageAt(imgs(3), 1).map((i) => i.url)).toEqual(["u0", "u2"]);
    expect(removeImageAt(imgs(3), 9)).toHaveLength(3);
  });
});

describe("collapse / promote shape", () => {
  it("1 → single image, 0 → empty, 2+ → group", () => {
    expect(shapeForCount(0)).toBe("empty");
    expect(shapeForCount(1)).toBe("single");
    expect(shapeForCount(2)).toBe("group");
    // Removing from a 2-image group leaves 1 → collapses to a single image.
    expect(shapeForCount(removeImageAt(imgs(2), 0).length)).toBe("single");
  });
});

describe("emergent-creation planning", () => {
  const doc = [
    { id: "p1", type: "paragraph" },
    { id: "img", type: "image" },
    { id: "grp", type: "imageGroup" },
    { id: "p2", type: "paragraph", blank: true },
    { id: "p3", type: "paragraph" },
  ];

  it("2+ images at a plain paragraph → a new group; 1 → a single image", () => {
    expect(planImageInsert(doc, "p3", 2)).toEqual({ action: "group" });
    expect(planImageInsert(doc, "p3", 1)).toEqual({ action: "single" });
  });

  it("dropping ONTO an existing image/gallery → merge into it", () => {
    expect(planImageInsert(doc, "img", 1)).toEqual({ action: "merge", targetId: "img" });
    expect(planImageInsert(doc, "grp", 3)).toEqual({ action: "merge", targetId: "grp" });
  });

  it("adjacency: a new image right before an existing image/gallery merges into it", () => {
    // anchor p1 sits directly above the image block → the new image lands adjacent to it.
    expect(planImageInsert(doc, "p1", 1)).toEqual({ action: "merge", targetId: "img" });
  });

  it("adjacency: a blank paragraph right after an image/gallery merges into it (nothing between)", () => {
    // p2 is blank and sits right after the group → merge into the group above.
    expect(planImageInsert(doc, "p2", 1)).toEqual({ action: "merge", targetId: "grp" });
  });

  it("never merges across a non-blank paragraph the user put between images", () => {
    const separated = [
      { id: "a", type: "image" },
      { id: "txt", type: "paragraph" },
      { id: "cursor", type: "paragraph" },
    ];
    // cursor is a plain paragraph; neighbours are text / nothing → a fresh single image.
    expect(planImageInsert(separated, "cursor", 1)).toEqual({ action: "single" });
  });
});
