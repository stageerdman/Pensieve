import { describe, it, expect } from "vitest";
import {
  RING,
  clampScroll,
  focusIndex,
  hiddenCounts,
  isScroll,
  layoutRing,
  loops,
  ringSpacing,
  snapScroll,
  voidOpacity,
} from "./ringLayout";

describe("ringLayout — mode + spacing", () => {
  it("fills a full even circle until the glyphs no longer fit, then uses the fixed pitch", () => {
    expect(ringSpacing(4)).toBe(90);
    expect(ringSpacing(6)).toBe(60);
    expect(ringSpacing(9)).toBe(40); // 9 × 40 = 360 exactly
    expect(ringSpacing(10)).toBe(RING.pitchDeg); // overflow → arc at the pitch
  });

  it("only enters arc mode (void fade + hidden counts) once a full circle overflows", () => {
    expect(isScroll(9)).toBe(false);
    expect(isScroll(10)).toBe(true);
  });
});

describe("ringLayout — full-circle rings (small n)", () => {
  it("places a single spell at the top", () => {
    const r = layoutRing(1);
    expect(r).toHaveLength(1);
    expect(r[0].angleDeg).toBe(0);
    expect(r[0].x).toBeCloseTo(0, 5);
    expect(r[0].y).toBeCloseTo(-RING.R, 5);
  });

  it("keeps every glyph fully visible and uniquely placed", () => {
    const r = layoutRing(6);
    for (const g of r) {
      expect(g.opacity).toBe(1);
      expect(g.scale).toBe(1);
      expect(g.visible).toBe(true);
    }
    const angles = new Set(r.map((g) => g.angleDeg));
    expect(angles.size).toBe(6); // no two glyphs collide
    expect(r[0].angleDeg).toBe(0); // index 0 rests at the top
    expect(r[0].focus).toBe(true);
  });
});

describe("ringLayout — the void fade", () => {
  it("is full at the top, zero inside the void, symmetric on both descents", () => {
    expect(voidOpacity(0)).toBe(1);
    expect(voidOpacity(180)).toBe(0);
    expect(voidOpacity(150)).toBe(0);
    expect(voidOpacity(120)).toBeCloseTo(1, 5);
    expect(voidOpacity(135)).toBeCloseTo(0.5, 5);
    expect(voidOpacity(-135)).toBeCloseTo(0.5, 5);
    expect(voidOpacity(-150)).toBe(0);
  });
});

describe("ringLayout — arc rings (large n) are FINITE", () => {
  it("rests glyph 0 at the top at the start and focuses it", () => {
    const r = layoutRing(10, 0);
    expect(r[0].angleDeg).toBe(0);
    expect(r[0].opacity).toBe(1);
    expect(r[0].focus).toBe(true);
    expect(r.filter((g) => g.focus)).toHaveLength(1);
  });

  it("at the start, later spells fan down one side and the far end is hidden", () => {
    const r = layoutRing(10, 0);
    expect(r[1].angleDeg).toBeCloseTo(40, 5); // next spell down the right
    expect(r[9].visible).toBe(false); // the far end hasn't scrolled into view yet
  });

  it("brings the last spell to the top only at the finite end (p = n-1)", () => {
    const r = layoutRing(10, 9);
    expect(r[9].angleDeg).toBeCloseTo(0, 5);
    expect(r[9].focus).toBe(true);
  });

  it("hides glyphs that drift into the void, counted by side; total matches", () => {
    const r = layoutRing(10, 4); // mid-scroll → hidden on BOTH sides
    const hidden = r.filter((g) => !g.visible);
    expect(hidden.length).toBeGreaterThan(0);
    const c = hiddenCounts(r);
    expect(c.left).toBeGreaterThan(0);
    expect(c.right).toBeGreaterThan(0);
    expect(c.left + c.right).toBe(hidden.length);
  });

  it("shrinks glyphs as they fade toward the void edge", () => {
    const r = layoutRing(10, 0.5);
    const fading = r.find((g) => g.opacity > 0 && g.opacity < 1);
    expect(fading).toBeDefined();
    expect(fading!.scale).toBeGreaterThan(0.6);
    expect(fading!.scale).toBeLessThan(1);
  });
});

describe("ringLayout — finite vs infinite rotation", () => {
  it("a full circle loops forever; an overflowing ring does not", () => {
    expect(loops(6)).toBe(true);
    expect(loops(10)).toBe(false);
  });

  it("full circles wrap the focus with no dead end", () => {
    expect(focusIndex(6, 6)).toBe(0);
    expect(focusIndex(6, -1)).toBe(5);
    expect(snapScroll(6, 2.4)).toBe(2);
    expect(snapScroll(6, 99)).toBe(99); // not clamped — it loops
  });

  it("arc rings clamp end-to-end (no infinite rotation when spells are hidden)", () => {
    expect(clampScroll(10, 50)).toBe(9);
    expect(clampScroll(10, -3)).toBe(0);
    expect(focusIndex(10, 23)).toBe(9);
    expect(focusIndex(10, -5)).toBe(0);
    expect(snapScroll(10, 99)).toBe(9);
    expect(snapScroll(10, -2)).toBe(0);
    expect(layoutRing(10, 1000).find((g) => g.focus)!.index).toBe(9); // pinned at the end
  });
});
