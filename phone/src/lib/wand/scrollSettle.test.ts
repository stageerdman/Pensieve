import { describe, it, expect } from "vitest";
import { easeOutCubic, settleTarget, needsSettle, settleDurationMs, settleScrollAt } from "./scrollSettle";
import { SLOT_H } from "./constants";

describe("easeOutCubic", () => {
  it("is 0 at t=0 and 1 at t=1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it("decelerates (front-loaded) — past the midpoint before t=0.5", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("settleTarget", () => {
  it("snaps to the nearest SLOT_H multiple", () => {
    expect(settleTarget(0)).toBe(0);
    expect(settleTarget(10)).toBe(0);
    expect(settleTarget(50)).toBe(SLOT_H);
    expect(settleTarget(84)).toBe(84);
    expect(settleTarget(200, 84)).toBe(168);
  });
});

describe("needsSettle", () => {
  it("skips sub-pixel drift", () => {
    expect(needsSettle(0.5)).toBe(false);
    expect(needsSettle(-0.9)).toBe(false);
    expect(needsSettle(1)).toBe(true);
    expect(needsSettle(-40)).toBe(true);
  });
});

describe("settleDurationMs", () => {
  it("clamps to [140, 260]", () => {
    expect(settleDurationMs(0)).toBe(140);
    expect(settleDurationMs(1000)).toBe(260);
  });
  it("scales linearly (x2.2) in between", () => {
    // dist=50 → 50*2.2=110, still below the 140 floor.
    expect(settleDurationMs(50)).toBe(140);
    // dist=100 → 100*2.2=220, inside [140,260].
    expect(settleDurationMs(100)).toBeCloseTo(220, 5);
  });
});

describe("settleScrollAt", () => {
  it("starts at `start` and ends at `start+dist`", () => {
    expect(settleScrollAt(100, 50, 0, 200)).toBe(100);
    expect(settleScrollAt(100, 50, 200, 200)).toBe(150);
  });
  it("clamps past the tween's duration", () => {
    expect(settleScrollAt(0, 84, 500, 200)).toBe(84);
  });
});
