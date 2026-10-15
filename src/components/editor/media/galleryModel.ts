// Pure logic for the inline gallery (imageGroup) — kept separate from the React block so
// the hard parts (count-driven layout, reorder, collapse/promote, emergent-creation
// planning) are unit-testable without a DOM or a live BlockNote editor.

import type { GalleryImage } from "../../../lib/md/gallery";

export type { GalleryImage };

// ── Count-driven layout (wiki "Count-driven layout") ───────────────────────────────────
// 1 → not a group (it's a single ImageBlock) · 2 → two cols · 3 → three cols · 4 → 2×2 ·
// 5–8 → justified rows, 3/row · 9+ → capped at 6 visible, the 6th a "+N more" cover.
// The count cap keeps a gallery at most ~2 rows tall; overflow spills into the lightbox.

/** Max tiles rendered in-block; beyond this the last tile becomes the "+N more" cover. */
export const MAX_VISIBLE_TILES = 6;

/** Columns in the grid for a given image count (drives `grid-template-columns`). */
export function galleryColumns(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 4) return 2; // 2×2
  return 3; // 3, 5–8, 9+ (capped at 6 = two rows of 3)
}

export interface GalleryLayout {
  /** How many tiles actually render (capped at MAX_VISIBLE_TILES). */
  tilesShown: number;
  /** Columns for the CSS grid. */
  columns: number;
  /** True when there are more images than tiles → the last tile is a "+N more" cover. */
  hasOverflow: boolean;
  /** The tile index that becomes the cover (−1 when no overflow). */
  coverIndex: number;
  /** The "+N" shown on the cover (images folded behind it, including the covered one). */
  overflowMore: number;
}

/** Resolve the layout for `count` images. */
export function galleryLayout(count: number): GalleryLayout {
  const hasOverflow = count > MAX_VISIBLE_TILES;
  const tilesShown = hasOverflow ? MAX_VISIBLE_TILES : count;
  return {
    tilesShown,
    columns: galleryColumns(count),
    hasOverflow,
    coverIndex: hasOverflow ? MAX_VISIBLE_TILES - 1 : -1,
    // The cover folds the covered image + everything after it (Facebook/Photos convention):
    // 9 images → "+4" over the 6th image; clicking opens the lightbox at that image.
    overflowMore: hasOverflow ? count - (MAX_VISIBLE_TILES - 1) : 0,
  };
}

// ── Ordered-list edits (order = fence line order, so reorder == line reorder) ────────────

/** Move the image at `from` to `to` (returns a new array; no-op on out-of-range/equal). */
export function reorderImages(images: GalleryImage[], from: number, to: number): GalleryImage[] {
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return images;
  const next = images.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Remove the image at `index` (returns a new array). */
export function removeImageAt(images: GalleryImage[], index: number): GalleryImage[] {
  if (index < 0 || index >= images.length) return images;
  return images.slice(0, index).concat(images.slice(index + 1));
}

/** After an edit, does the group collapse back to a single image / disappear?
 *  1 image → collapse to a single `image` block · 0 → the block is removed entirely. */
export type GroupShape = "group" | "single" | "empty";
export function shapeForCount(count: number): GroupShape {
  if (count <= 0) return "empty";
  if (count === 1) return "single";
  return "group";
}

// ── Emergent-creation planning (wiki "Emergent gallery") ────────────────────────────────
// No explicit "create gallery" act. 2+ images in one gesture → a group. A new image created
// directly adjacent to an existing image/gallery (nothing between) joins it. A drop ONTO an
// existing image/gallery joins it. We NEVER silently merge images the user separated with
// text — only adjacency at creation.

interface PlanBlock {
  id: string;
  type?: string;
  /** For a paragraph: is it blank (no meaningful text)? Lets "nothing between" be detected. */
  blank?: boolean;
}

export type InsertPlan =
  | { action: "merge"; targetId: string } // join an existing image/imageGroup
  | { action: "group" } // create a new imageGroup
  | { action: "single" }; // create a single image block

function isImageLike(b: PlanBlock | undefined): boolean {
  return !!b && (b.type === "image" || b.type === "imageGroup");
}

/** Decide how images entering at/after `anchorId` should land.
 *  - anchor is itself an image/group → merge into it (the drop-onto gesture);
 *  - else if the block right after the anchor is an image/group → merge (adjacency: the new
 *    image lands directly before it, nothing between);
 *  - else if the anchor is a blank paragraph and the block right before it is an image/group
 *    → merge (adjacency: nothing meaningful between);
 *  - else create: 2+ files → a group, 1 file → a single image. */
export function planImageInsert(blocks: PlanBlock[], anchorId: string | null, fileCount: number): InsertPlan {
  const idx = anchorId ? blocks.findIndex((b) => b.id === anchorId) : -1;
  const anchor = idx >= 0 ? blocks[idx] : undefined;

  if (isImageLike(anchor)) return { action: "merge", targetId: anchor!.id };

  if (idx >= 0) {
    const next = blocks[idx + 1];
    if (isImageLike(next)) return { action: "merge", targetId: next!.id };
    const prev = blocks[idx - 1];
    if (anchor?.blank && isImageLike(prev)) return { action: "merge", targetId: prev!.id };
  }

  return fileCount >= 2 ? { action: "group" } : { action: "single" };
}
