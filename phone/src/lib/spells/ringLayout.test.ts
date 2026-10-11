import { describe, it, expect } from "vitest";
import {
  RING,
  angularGap,
  dragToScroll,
  isScroll,
  layoutRing,
  maxScroll,
  snapScroll,
  voidOpacity,
} from "./ringLayout";

describe("ringLayout — regime selection", () => {
  it("is static at the capacity and scrolls just above it", () => {
    expect(isScroll(RING.capacity)).toBe(false); // 8
    expect(isScroll(RING.capacity + 1)).toBe(true); // 9
  });

  it("maxScroll puts the last glyph at the top", () => {
    expect(maxScroll(9)).toBe(8);
    expect(maxScroll(1)).toBe(0);
    expect(maxScroll(0)).toBe(0);
  });
});

describe("ringLayout — static rings", () => {
  it("places a single spell at the top", () => {
    const r = layoutRing(1);
    expect(r).toHaveLength(1);
    expect(r[0].angleDeg).toBe(0);
    expect(r[0].x).toBeCloseTo(0, 5);
    expect(r[0].y).toBeCloseTo(-RING.R, 5); // straight up = negative screen-y
    expect(r[0].opacity).toBe(1);
  });

  it("uses a lower arc for 2 and 3 spells (thumb zone)", () => {
    expect(layoutRing(2).map((g) => g.angleDeg)).toEqual([120, 240]);
    expect(layoutRing(3).map((g) => g.angleDeg)).toEqual([110, 180, 250]);
  });

  it("spaces 4–8 spells evenly around a full circle from 12 o'clock", () => {
    expect(layoutRing(4).map((g) => g.angleDeg)).toEqual([0, 90, 180, 270]);
    const six = layoutRing(6).map((g) => g.angleDeg);
    expect(six).toEqual([0, 60, 120, 180, 240, 300]);
  });

  it("keeps every static glyph fully visible at full scale", () => {
    for (const g of layoutRing(6)) {
      expect(g.opacity).toBe(1);
      expect(g.scale).toBe(1);
      expect(g.visible).toBe(true);
    }
  });
});

describe("ringLayout — the void fade", () => {
  it("is full at the top, zero inside the void wedge", () => {
    expect(voidOpacity(0)).toBe(1);
    expect(voidOpacity(180)).toBe(0); // straight down, in the void
    expect(voidOpacity(150)).toBe(0); // void edge is inside the wedge
    expect(voidOpacity(210)).toBe(0);
  });

  it("ramps linearly over fadeRamp degrees approaching each edge", () => {
    expect(voidOpacity(120)).toBeCloseTo(1, 5); // 30° out = fully lit
    expect(voidOpacity(135)).toBeCloseTo(0.5, 5);
    expect(voidOpacity(240)).toBeCloseTo(1, 5);
    expect(voidOpacity(225)).toBeCloseTo(0.5, 5);
  });
});

describe("ringLayout — scroll rings", () => {
  it("rests glyph 0 at the top at p=0 and focuses it", () => {
    const r = layoutRing(10, 0);
    expect(r[0].angleDeg).toBe(0);
    expect(r[0].opacity).toBe(1);
    expect(r[0].focus).toBe(true);
    expect(r.filter((g) => g.focus)).toHaveLength(1);
  });

  it("hides glyphs that rotate into the void", () => {
    const r = layoutRing(10, 0);
    // glyph 4 sits at 160° (in the void) → invisible
    expect(r[4].angleDeg).toBe(160);
    expect(r[4].visible).toBe(false);
  });

  it("shrinks glyphs as they fade toward the void edge", () => {
    // at p=0.5 glyph 4 sits at 140° — inside the [120,150] ramp → partly faded
    const r = layoutRing(10, 0.5);
    const g4 = r[4];
    expect(g4.angleDeg).toBeCloseTo(140, 5);
    expect(g4.opacity).toBeGreaterThan(0);
    expect(g4.opacity).toBeLessThan(1);
    expect(g4.scale).toBeGreaterThan(0.6);
    expect(g4.scale).toBeLessThan(1);
  });

  it("advances the focus as p increases", () => {
    expect(layoutRing(10, 2).find((g) => g.focus)!.index).toBe(2);
    expect(layoutRing(10, 2.4).find((g) => g.focus)!.index).toBe(2);
  });

  it("clamps p to the finite range (no infinite scroll)", () => {
    const over = layoutRing(10, 999);
    expect(over[9].angleDeg).toBe(0); // last glyph pinned at the top
    const under = layoutRing(10, -999);
    expect(under[0].angleDeg).toBe(0); // first glyph pinned at the top
  });
});

describe("ringLayout — helpers", () => {
  it("angularGap takes the short way around", () => {
    expect(angularGap(350, 10)).toBe(20);
    expect(angularGap(0, 180)).toBe(180);
  });

  it("maps drag px to slots and snaps within range", () => {
    expect(dragToScroll(RING.dragPxPerSlot)).toBe(1);
    expect(snapScroll(10, 2.4)).toBe(2);
    expect(snapScroll(10, 99)).toBe(9);
    expect(snapScroll(10, -5)).toBe(0);
  });
});
