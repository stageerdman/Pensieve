// Shared pointer-drag scroll helpers for the editor's two drag engines (block drag +
// marquee select). Both need the same "find the scroller" + "auto-scroll near an edge"
// behaviour; this is the one home for it (see CODING.md — never build the same thing twice).

// Pointer must travel this far before a press becomes a drag (below it, it's a plain
// click — placing a caret, grabbing the handle — left untouched).
export const DRAG_THRESHOLD = 5;
// Auto-scroll kicks in within this many px of the scroll edge; speed scales with depth.
export const EDGE = 56;
export const MAX_SPEED = 18;

// The nearest scrollable ancestor — the surface the editor actually scrolls inside.
export function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let e = el?.parentElement ?? null;
  while (e) {
    const oy = getComputedStyle(e).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && e.scrollHeight > e.clientHeight) return e;
    e = e.parentElement;
  }
  return null;
}

// Scroll `scroller` (or the window, if null) toward whichever edge `pointerY` is near,
// at a speed that ramps up the closer the pointer is to the edge. Returns true if it
// scrolled (pointer was in an edge zone) — the caller re-selects/recomputes and schedules
// the next animation frame only while this keeps returning true.
export function autoScrollEdge(scroller: HTMLElement | null, pointerY: number): boolean {
  const top = scroller ? scroller.getBoundingClientRect().top : 0;
  const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
  let dy = 0;
  if (pointerY < top + EDGE) dy = -MAX_SPEED * Math.min(1, (top + EDGE - pointerY) / EDGE);
  else if (pointerY > bottom - EDGE) dy = MAX_SPEED * Math.min(1, (pointerY - (bottom - EDGE)) / EDGE);
  if (dy === 0) return false;
  if (scroller) scroller.scrollBy(0, dy);
  else window.scrollBy(0, dy);
  return true;
}
