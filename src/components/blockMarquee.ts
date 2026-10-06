// Pure geometry + targeting helpers for the editor's Notion-style marquee (rubber-band)
// block selection. Kept free of React/DOM-event wiring so the tricky bits — which rows a
// drag box covers, and whether a press should even begin a marquee — are unit-testable.
// The stateful pointer wiring that uses these lives in useBlockMarquee.ts.

export interface BlockRect {
  id: string;
  top: number;
  bottom: number;
}

export interface Band {
  top: number;
  bottom: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Row-wise selection: a block is in the band when its vertical span intersects the
// band's. We deliberately ignore X — a margin drag is a vertical gesture, and Notion
// selects every row the box reaches down to, regardless of how far right it extends.
export function blocksInBand(blocks: BlockRect[], band: Band): string[] {
  const lo = Math.min(band.top, band.bottom);
  const hi = Math.max(band.top, band.bottom);
  return blocks.filter((b) => b.top < hi && b.bottom > lo).map((b) => b.id);
}

// Would a press at this element begin a marquee? Only in genuinely blank editor space —
// not on real text (that stays a text selection), not the drag-handle gutter, and not an
// interactive control (buttons, links, inputs, file blocks). This is what lets a drag
// over paragraph text keep selecting text while a drag from the margin rubber-bands rows.
export function isBlankMarqueeTarget(el: Element | null, root: Element): boolean {
  if (!el || !root.contains(el)) return false;
  if (el.closest(".bn-inline-content")) return false; // real text → native text selection
  if (el.closest(".bn-side-menu")) return false; // the drag handle lives here
  if (
    el.closest(
      'button, a, input, textarea, select, label, [role="button"], [role="menuitem"], .bn-formatting-toolbar, [data-file-block]',
    )
  )
    return false;
  return true;
}

// The on-screen rubber-band rectangle between the press origin and the current pointer,
// normalised so width/height are always positive (drag up/left works the same as down/right).
export function rectBetween(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    width: Math.abs(ax - bx),
    height: Math.abs(ay - by),
  };
}
