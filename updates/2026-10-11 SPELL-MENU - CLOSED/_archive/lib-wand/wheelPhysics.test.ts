import { describe, it, expect } from "vitest";
import {
  wrap,
  stepRotationSpring,
  isRotationAtRest,
  clampRotationVelocity,
  stepCollapseSpring,
  isCollapseAtRest,
  type RotationState,
  type CollapseState,
} from "./wheelPhysics";
import { MAX_VEL } from "./constants";

describe("wrap", () => {
  it("wraps into (-N/2, N/2] for a 4-button ring", () => {
    expect(wrap(0, 4)).toBe(0);
    expect(wrap(1, 4)).toBe(1);
    expect(wrap(2, 4)).toBe(2);
    expect(wrap(3, 4)).toBe(-1);
    expect(wrap(-1, 4)).toBe(-1);
    expect(wrap(-3, 4)).toBe(1);
    expect(wrap(4, 4)).toBe(0);
  });
  it("is the shortest signed path around the ring", () => {
    // offset 5 on a 4-ring is equivalent to 1 step forward.
    expect(wrap(5, 4)).toBe(1);
  });
});

function runRotation(target: number, steps: number, dt: number): RotationState {
  let state: RotationState = { pos: 0, vel: 0 };
  let maxOvershoot = 0;
  for (let i = 0; i < steps; i++) {
    state = stepRotationSpring(state, target, dt);
    if (state.pos > target) maxOvershoot = Math.max(maxOvershoot, state.pos - target);
    if (isRotationAtRest(state, target)) break;
  }
  // Critically-damped (DAMPING=1) + extra friction should not meaningfully overshoot
  // a step response starting at rest.
  expect(maxOvershoot).toBeLessThan(0.02);
  return state;
}

describe("stepRotationSpring — critically-damped detent spring", () => {
  it("converges to the target without overshoot", () => {
    const final = runRotation(1, 600, 1 / 60);
    expect(final.pos).toBeCloseTo(1, 2);
  });
  it("isRotationAtRest is false while still moving, true once settled", () => {
    let state: RotationState = { pos: 0, vel: 0 };
    expect(isRotationAtRest(state, 2)).toBe(false);
    for (let i = 0; i < 600; i++) state = stepRotationSpring(state, 2, 1 / 60);
    expect(isRotationAtRest(state, 2)).toBe(true);
  });
});

describe("clampRotationVelocity", () => {
  it("clamps to ±MAX_VEL", () => {
    expect(clampRotationVelocity(1000)).toBe(MAX_VEL);
    expect(clampRotationVelocity(-1000)).toBe(-MAX_VEL);
    expect(clampRotationVelocity(5)).toBe(5);
  });
});

describe("stepCollapseSpring — underdamped gravity well (COLLAPSE_DAMP<1 → overshoot)", () => {
  it("overshoots target=1 before settling (slight spring pull-through)", () => {
    let state: CollapseState = { t: 0, v: 0 };
    let maxT = 0;
    for (let i = 0; i < 600; i++) {
      state = stepCollapseSpring(state, 1, 1 / 60);
      maxT = Math.max(maxT, state.t);
      if (isCollapseAtRest(state, 1)) break;
    }
    expect(maxT).toBeGreaterThan(1); // the documented "slight overshoot"
    expect(state.t).toBeCloseTo(1, 2);
  });
  it("isCollapseAtRest settles back to 0 on expand", () => {
    let state: CollapseState = { t: 1, v: 0 };
    expect(isCollapseAtRest(state, 0)).toBe(false);
    for (let i = 0; i < 600; i++) state = stepCollapseSpring(state, 0, 1 / 60);
    expect(isCollapseAtRest(state, 0)).toBe(true);
    expect(state.t).toBeCloseTo(0, 2);
  });
});
