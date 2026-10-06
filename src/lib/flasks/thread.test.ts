import { describe, it, expect } from "vitest";
import { memoryThread } from "./thread";

const band = { yTop: 12, yBottom: 28 };

describe("memoryThread", () => {
  it("is deterministic — same id yields the same strand", () => {
    const a = memoryThread({ seed: "lx8k2p3-a9f3kz", ...band });
    const b = memoryThread({ seed: "lx8k2p3-a9f3kz", ...band });
    expect(a.d).toBe(b.d);
    expect(a.width).toBe(b.width);
  });

  it("different ids yield visibly different strands", () => {
    const ids = ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"];
    const paths = new Set(ids.map((seed) => memoryThread({ seed, ...band }).d));
    // No accidental collisions across a handful of seeds.
    expect(paths.size).toBe(ids.length);
  });

  it("produces a valid path that starts with a move and has a sane width", () => {
    const { d, width } = memoryThread({ seed: "note-123", ...band });
    expect(d).toMatch(/^M [\d.-]+ [\d.-]+/);
    expect(d).toMatch(/[CL]/); // either a curve (smooth) or a line (sharp)
    expect(width).toBeGreaterThanOrEqual(1);
    expect(width).toBeLessThanOrEqual(1.8);
  });

  it("spans most of the band (floor → surface) and stays finite", () => {
    // Pull coordinates out of the path. Curls and loops legitimately overshoot the
    // sample points; the clip handles exact containment, so here we only assert the
    // strand covers the middle of the band and never emits a non-finite number.
    const { d } = memoryThread({ seed: "bounds-check", yTop: 8, yBottom: 28 });
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums.length).toBeGreaterThan(0);
    expect(nums.every(Number.isFinite)).toBe(true);
    const ys = nums.filter((_, i) => i % 2 === 1); // every 2nd number is a y
    expect(Math.min(...ys)).toBeLessThan(14); // reaches up toward the surface
    expect(Math.max(...ys)).toBeGreaterThan(22); // reaches down toward the floor
  });

  it("keeps every coordinate finite and roughly near the body centre", () => {
    const { d } = memoryThread({ seed: "x-range", ...band });
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums.every(Number.isFinite)).toBe(true);
    const xs = nums.filter((_, i) => i % 2 === 0);
    // Centre is 12; swing + bias + loops stay in a sane neighbourhood (never flung off).
    expect(Math.min(...xs)).toBeGreaterThan(2);
    expect(Math.max(...xs)).toBeLessThan(22);
  });
});
