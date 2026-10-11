// wheelPhysics.ts — pure physics for the thumb-wheel's rotation + collapse springs.
//
// Ported verbatim from 01-the-wand-v2.html ~lines 1097-1182 (wrap, the per-frame
// rotation spring, the per-frame collapse/"gravity well" spring). DOM-free: these
// functions take state + dt and return next state. The rAF loop, DOM writes, and
// pointer-gesture wiring belong in a Wave-2 hook, not here.

import {
  STIFFNESS,
  DAMPING,
  FRICTION,
  REST_V,
  REST_X,
  MAX_VEL,
  COLLAPSE_STIFF,
  COLLAPSE_DAMP,
  COL_REST_V,
  COL_REST_X,
} from "./constants";

/** Wrap an index offset into (-N/2, N/2] — the shortest signed distance around an
 *  N-button ring. Source ~1106:
 *  `function wrap(o){ o=((o%N)+N)%N; if(o>N/2) o-=N; return o; }` */
export function wrap(o: number, N: number): number {
  o = ((o % N) + N) % N;
  if (o > N / 2) o -= N;
  return o;
}

export interface RotationState {
  /** Fractional detent position (e.g. 1.5 = halfway between buttons 1 and 2). */
  pos: number;
  /** Angular velocity, in detents/second. */
  vel: number;
}

/** One critically-damped spring step of the rotation toward `target` (a detent
 *  index while free, or the hero's shortest-path target while collapsing).
 *  Source ~1164-1166:
 *  ```
 *  const dist=target-pos, k=CFG.STIFFNESS, c=2*Math.sqrt(k)*CFG.DAMPING;
 *  vel += (k*dist - c*vel)*dt; vel *= Math.exp(-CFG.FRICTION*dt); pos += vel*dt;
 *  ``` */
export function stepRotationSpring(state: RotationState, target: number, dt: number): RotationState {
  const dist = target - state.pos;
  const k = STIFFNESS;
  const c = 2 * Math.sqrt(k) * DAMPING;
  let vel = state.vel + (k * dist - c * state.vel) * dt;
  vel *= Math.exp(-FRICTION * dt);
  const pos = state.pos + vel * dt;
  return { pos, vel };
}

/** True once the rotation spring has settled onto `target`. Source ~1175:
 *  `Math.abs(vel)<CFG.REST_V && Math.abs(target-pos)<CFG.REST_X`. */
export function isRotationAtRest(state: RotationState, target: number): boolean {
  return Math.abs(state.vel) < REST_V && Math.abs(target - state.pos) < REST_X;
}

/** Clamp a fling's release velocity to the wheel's max angular speed. Applied once
 *  at pointerup, not inside the per-frame step — same physics domain though.
 *  Source ~1264: `vel=Math.max(-CFG.MAX_VEL,Math.min(CFG.MAX_VEL,vel))`. */
export function clampRotationVelocity(vel: number): number {
  return Math.max(-MAX_VEL, Math.min(MAX_VEL, vel));
}

export interface CollapseState {
  /** 0 = fully expanded arc, 1 = fully sucked into the lone wand. */
  t: number;
  v: number;
}

/** One (slightly underdamped) spring step of the collapse/expand "gravity well"
 *  toward `target` (0 or 1). Source ~1170-1171:
 *  ```
 *  const kc=CFG.COLLAPSE_STIFF, cc=2*Math.sqrt(kc)*CFG.COLLAPSE_DAMP;
 *  collapseV += (kc*(collapseTarget-collapseT) - cc*collapseV)*dt; collapseT += collapseV*dt;
 *  ``` */
export function stepCollapseSpring(state: CollapseState, target: number, dt: number): CollapseState {
  const kc = COLLAPSE_STIFF;
  const cc = 2 * Math.sqrt(kc) * COLLAPSE_DAMP;
  const v = state.v + (kc * (target - state.t) - cc * state.v) * dt;
  const t = state.t + v * dt;
  return { t, v };
}

/** True once the collapse spring has settled onto `target`. Source ~1172:
 *  `Math.abs(collapseV)<CFG.COL_REST_V && Math.abs(collapseTarget-collapseT)<CFG.COL_REST_X`. */
export function isCollapseAtRest(state: CollapseState, target: number): boolean {
  return Math.abs(state.v) < COL_REST_V && Math.abs(target - state.t) < COL_REST_X;
}
