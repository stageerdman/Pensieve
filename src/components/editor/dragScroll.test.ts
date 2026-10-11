import { describe, it, expect, vi, afterEach } from "vitest";
import { autoScrollEdge, EDGE, MAX_SPEED } from "./dragScroll";

// A minimal scroller stub: fixed viewport box + a scrollBy spy. Avoids jsdom layout
// (scrollHeight/clientHeight aren't computed in jsdom), so we test the edge math directly.
function makeScroller(top: number, bottom: number) {
  const scrollBy = vi.fn();
  const el = {
    getBoundingClientRect: () => ({ top, bottom } as DOMRect),
    scrollBy,
  } as unknown as HTMLElement;
  return { el, scrollBy };
}

afterEach(() => vi.restoreAllMocks());

describe("autoScrollEdge", () => {
  it("does nothing when the pointer is away from both edges", () => {
    const { el, scrollBy } = makeScroller(100, 500);
    expect(autoScrollEdge(el, 300)).toBe(false);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("scrolls UP (negative dy) near the top edge, ramping with depth", () => {
    const { el, scrollBy } = makeScroller(100, 500);
    // 10px into the 56px top zone → speed scales to ~ (EDGE-… )/EDGE of MAX_SPEED.
    const pointerY = 100 + EDGE - 10; // just inside the top edge zone
    expect(autoScrollEdge(el, pointerY)).toBe(true);
    const dy = scrollBy.mock.calls[0][1] as number;
    expect(dy).toBeLessThan(0);
    expect(Math.abs(dy)).toBeLessThanOrEqual(MAX_SPEED);
  });

  it("scrolls DOWN (positive dy) near the bottom edge", () => {
    const { el, scrollBy } = makeScroller(100, 500);
    const pointerY = 500 - EDGE + 10; // just inside the bottom edge zone
    expect(autoScrollEdge(el, pointerY)).toBe(true);
    expect(scrollBy.mock.calls[0][1] as number).toBeGreaterThan(0);
  });

  it("hits MAX_SPEED right at the edge and ramps down moving inward", () => {
    const { el, scrollBy } = makeScroller(100, 500);
    autoScrollEdge(el, 500); // exactly at the bottom edge → full speed
    const atEdge = scrollBy.mock.calls[0][1] as number;
    expect(atEdge).toBeCloseTo(MAX_SPEED, 5);
    scrollBy.mockClear();
    autoScrollEdge(el, 500 - EDGE / 2); // halfway into the zone → ~half speed
    expect(scrollBy.mock.calls[0][1] as number).toBeCloseTo(MAX_SPEED / 2, 5);
  });

  it("falls back to the window when no scroller is given", () => {
    const spy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    expect(autoScrollEdge(null, 5)).toBe(true); // 5px from the window top (top=0)
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][1] as number).toBeLessThan(0);
  });
});
