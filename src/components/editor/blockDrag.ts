// Pure drop-target logic for the pointer-based block drag. BlockNote's own drag is
// HTML5 drag-and-drop, which doesn't work in the WKWebView native shell (the drag starts
// but no drop ever lands) — so we move blocks ourselves with pointer events, and this
// module decides *where* a drop lands. Kept DOM-free so the placement rules are testable.

export interface DropBlock {
  id: string;
  top: number;
  bottom: number;
  left: number; // content left edge (indent level ↑ with nesting)
  canNest: boolean; // may this block contain children?
  media?: boolean; // an image/imageGroup block → a drop-onto-merge target
}

export interface DropTarget {
  referenceId: string;
  placement: "before" | "after";
  nest: boolean; // drop as a child of referenceId (vs. a sibling)
  merge?: boolean; // drop the dragged media INTO referenceId (merge into a gallery)
}

// Drag the pointer this far right of a block's content edge to nest under it.
export const NEST_INDENT = 24;

// Decide where a drop at (x, y) lands. We reckon only against *stationary* blocks (the
// moving set and its descendants are excluded), so you can never drop a block into its
// own subtree, and the gap is measured between the blocks that are actually staying put.
// `draggedMedia` (the drag carries only image/gallery blocks) unlocks drop-onto-merge: hovering
// INSIDE a media block merges into it (build/extend a gallery) instead of reordering around it.
export function computeDrop(
  blocks: DropBlock[],
  x: number,
  y: number,
  moving: Set<string>,
  draggedMedia = false,
): DropTarget | null {
  const stationary = blocks.filter((b) => !moving.has(b.id));
  if (stationary.length === 0) return null;

  // Merge: pointer inside a stationary media block + dragging media → drop INTO it.
  if (draggedMedia) {
    const over = stationary.find((b) => y >= b.top && y <= b.bottom && b.media);
    if (over) return { referenceId: over.id, placement: "after", nest: false, merge: true };
  }

  // The gap sits after the last block whose vertical midpoint is above the pointer.
  let afterIdx = -1;
  for (let i = 0; i < stationary.length; i++) {
    const mid = (stationary[i].top + stationary[i].bottom) / 2;
    if (mid <= y) afterIdx = i;
    else break;
  }

  if (afterIdx === -1) {
    // Above everything → land before the first stationary block.
    return { referenceId: stationary[0].id, placement: "before", nest: false };
  }
  const ref = stationary[afterIdx];
  // Far enough right of the block's content edge → nest under it; otherwise sibling.
  const nest = ref.canNest && x > ref.left + NEST_INDENT;
  return { referenceId: ref.id, placement: "after", nest };
}
