import { describe, it, expect } from "vitest";
import {
  snapWidth,
  stepWidth,
  presetWidth,
  widthPreset,
  cornerResize,
  restoreShape,
  isDefaultShape,
  frameAspect,
  DEFAULT_WIDTH,
  PLACEHOLDER_ASPECT,
} from "./mediaShape";

describe("mediaShape", () => {
  it("snaps a width to the nearest preset", () => {
    expect(snapWidth(0.3)).toBe(0.25);
    expect(snapWidth(0.6)).toBe(0.5);
    expect(snapWidth(0.9)).toBe(1);
  });

  it("steps width between snaps and clamps at the ends", () => {
    expect(stepWidth(0.75, 1)).toBe(1);
    expect(stepWidth(1, 1)).toBe(1); // clamp top
    expect(stepWidth(0.75, -1)).toBe(0.5);
    expect(stepWidth(0.25, -1)).toBe(0.25); // clamp bottom
  });

  it("maps size presets to widths and back", () => {
    expect(presetWidth("small")).toBe(0.25);
    expect(presetWidth("full")).toBe(1);
    expect(widthPreset(0.5)).toBe("medium");
    expect(widthPreset(0.75)).toBe("large");
    expect(widthPreset(0.33)).toBeNull();
  });

  it("corner resize returns a clamped {width, aspect}", () => {
    // start 300×200 in a 600px column; drag +150,+0 → wider, shorter box
    const s = cornerResize(300, 200, 150, 0, 600);
    expect(s.width).toBeCloseTo(0.75, 2); // (300+150)/600
    expect(s.aspect).toBeCloseTo(450 / 200, 2);
    // extreme drags clamp, never collapse
    const tiny = cornerResize(300, 200, -1000, 1000, 600);
    expect(tiny.width).toBeGreaterThanOrEqual(0.15);
    expect(tiny.aspect).toBeGreaterThanOrEqual(0.3);
    const huge = cornerResize(300, 200, 5000, -5000, 600);
    expect(huge.width).toBeLessThanOrEqual(1);
    expect(huge.aspect).toBeLessThanOrEqual(4);
  });

  it("restore clears aspect and resets width", () => {
    expect(restoreShape()).toEqual({ width: DEFAULT_WIDTH, aspect: 0 });
  });

  it("recognises the default shape (→ plain markdown, no fence)", () => {
    expect(isDefaultShape(0.75, 0)).toBe(true);
    expect(isDefaultShape(undefined, undefined)).toBe(true);
    expect(isDefaultShape(0.5, 0)).toBe(false); // non-default width
    expect(isDefaultShape(0.75, 1.5)).toBe(false); // explicit aspect
  });

  it("frameAspect: explicit shape wins; empty→placeholder; loaded→undefined", () => {
    expect(frameAspect(1.5, false)).toBe(1.5);
    expect(frameAspect(1.5, true)).toBe(1.5);
    expect(frameAspect(0, false)).toBe(PLACEHOLDER_ASPECT); // empty placeholder, natural
    expect(frameAspect(0, true)).toBeUndefined(); // loaded image sizes itself
  });
});
