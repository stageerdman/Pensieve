import { describe, it, expect } from "vitest";
import * as C from "./constants";

describe("wand constants — locked tunables, cross-checked against source CFG", () => {
  it("wheel rotation tunables", () => {
    expect(C.STEP_DEG).toBe(31);
    expect(C.CENTER_R).toBe(150);
    expect(C.MAX_VIS).toBe(2.25);
    expect(C.R_MIN).toBe(118);
    expect(C.R_MAX).toBe(300);
    expect(C.FLIP_MS).toBe(2000);
    expect(C.HOLD_MS).toBe(420);
    expect(C.TAP_DEG).toBe(4);
    expect(C.FRICTION).toBe(3.0);
    expect(C.STIFFNESS).toBe(115);
    expect(C.DAMPING).toBe(1.0);
    expect(C.MAX_VEL).toBe(30);
    expect(C.REST_V).toBe(0.02);
    expect(C.REST_X).toBe(0.004);
  });

  it("collapse/expand gravity-well tunables", () => {
    expect(C.COLLAPSE_R).toBe(64);
    expect(C.COLLAPSE_SPAN).toBe(150);
    expect(C.PEND_PX).toBe(8);
    expect(C.FLICK_DIST).toBe(34);
    expect(C.FLICK_VEL).toBe(520);
    expect(C.COLLAPSE_STIFF).toBe(150);
    expect(C.COLLAPSE_DAMP).toBe(0.6);
  });

  it("loupe/reel tunables", () => {
    expect(C.SLOT_H).toBe(84);
    expect(C.FOCAL_FRAC).toBe(0.2); // owner tuning 2026-10-12: loupe rides near the top
    expect(C.GLASS_H).toBe(165); // owner tuning 2026-10-12: a little taller
    expect(C.LOUPE_R).toBe(2.0);
    expect(C.LOUPE_MAX).toBe(1.75);
    expect(C.REVEAL_IN).toBe(0.55);
  });

  it("DAMPING of 1.0 is exactly critical damping (no overshoot)", () => {
    // Critical damping: c = 2*sqrt(k) when DAMPING===1.
    expect(C.DAMPING).toBe(1);
  });
});
