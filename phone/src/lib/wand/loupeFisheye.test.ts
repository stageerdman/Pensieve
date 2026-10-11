import { describe, it, expect } from "vitest";
import {
  hannWeight,
  magnificationAt,
  partingIntegral,
  partingOffset,
  smoothstep01,
  revealAt,
  opacityAt,
  fractionalFocus,
} from "./loupeFisheye";
import { LOUPE_R, LOUPE_MAX, SLOT_H, REVEAL_IN } from "./constants";

describe("fractionalFocus", () => {
  it("is scrollTop / slotH", () => {
    expect(fractionalFocus(84, 84)).toBe(1);
    expect(fractionalFocus(42, 84)).toBe(0.5);
    expect(fractionalFocus(168)).toBe(2); // default SLOT_H
  });
});

describe("hannWeight", () => {
  it("is 1 at the centre", () => {
    expect(hannWeight(0)).toBeCloseTo(1, 10);
  });
  it("is 0 at and beyond ±R", () => {
    expect(hannWeight(LOUPE_R)).toBe(0);
    expect(hannWeight(LOUPE_R + 1)).toBe(0);
    expect(hannWeight(-LOUPE_R - 0.5)).toBe(0);
  });
  it("is symmetric (even function)", () => {
    expect(hannWeight(0.7)).toBeCloseTo(hannWeight(-0.7), 10);
  });
});

describe("magnificationAt", () => {
  it("peaks at LOUPE_MAX at the focal line (deltaSlots=0)", () => {
    expect(magnificationAt(0)).toBeCloseTo(LOUPE_MAX, 10);
  });
  it("decays to 1 (no magnification) at and beyond ±R", () => {
    expect(magnificationAt(LOUPE_R)).toBeCloseTo(1, 10);
    expect(magnificationAt(5)).toBeCloseTo(1, 10);
  });
});

describe("partingIntegral (W) — the odd integral of the Hann lobe", () => {
  it("W(0) === 0 — the focal line never drifts", () => {
    expect(partingIntegral(0)).toBe(0);
  });
  it("is odd: W(-x) === -W(x)", () => {
    for (const x of [0.3, 0.9, 1.5, 2.0, 3.5]) {
      expect(partingIntegral(-x)).toBeCloseTo(-partingIntegral(x), 10);
    }
  });
  it("saturates to ±R/2 beyond the influence radius", () => {
    expect(partingIntegral(LOUPE_R + 10)).toBeCloseTo(LOUPE_R / 2, 10);
    expect(partingIntegral(-(LOUPE_R + 10))).toBeCloseTo(-LOUPE_R / 2, 10);
  });
});

describe("partingOffset", () => {
  it("is zero at the focal line", () => {
    expect(partingOffset(0)).toBe(0);
  });
  it("scales with SLOT_H and (LOUPE_MAX-1)", () => {
    const x = 1;
    const expected = SLOT_H * (LOUPE_MAX - 1) * partingIntegral(x);
    expect(partingOffset(x)).toBeCloseTo(expected, 10);
  });
});

describe("smoothstep01", () => {
  it("clamps and smooths the ends", () => {
    expect(smoothstep01(-1)).toBe(0);
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(1)).toBe(1);
    expect(smoothstep01(2)).toBe(1);
    expect(smoothstep01(0.5)).toBeCloseTo(0.5, 10);
  });
});

describe("revealAt", () => {
  it("is 0 below REVEAL_IN and 1 at w=1", () => {
    expect(revealAt(0)).toBe(0);
    expect(revealAt(REVEAL_IN)).toBe(0);
    expect(revealAt(1)).toBe(1);
  });
});

describe("opacityAt", () => {
  it("ranges 0.85..1.0", () => {
    expect(opacityAt(0)).toBeCloseTo(0.85, 10);
    expect(opacityAt(1)).toBeCloseTo(1.0, 10);
  });
});
