// loupeFisheye.ts — pure math for the reel's scroll-linked vertical fisheye (the loupe).
//
// Ported verbatim from 01-the-wand-v2.html ~lines 735-773. The focal row swells into
// the magnified reading; neighbours are pushed clear by the integral of the same
// curve (so nothing can hide under the glass). Driven by the FRACTIONAL scroll
// position f = scrollTop/SLOT_H. DOM-free: these functions take slot offsets and
// return numbers; a Wave-2 hook writes them into transform/opacity per frame.

import { LOUPE_R, LOUPE_MAX, REVEAL_IN, SLOT_H } from "./constants";

/** f = scrollTop / SLOT_H — the fractional slot index currently centred under the
 *  focal line. Source ~751: `const f = reel.scrollTop / SLOT_H;`. */
export function fractionalFocus(scrollTop: number, slotH: number = SLOT_H): number {
  return scrollTop / slotH;
}

/** Hann lobe: 1 at the centre (x=0), 0 at |x| >= R. Source ~758:
 *  `ax < LOUPE_R ? 0.5*(1 + Math.cos(PI*x/LOUPE_R)) : 0`. */
export function hannWeight(deltaSlots: number, R: number = LOUPE_R): number {
  const ax = Math.abs(deltaSlots);
  return ax < R ? 0.5 * (1 + Math.cos((Math.PI * deltaSlots) / R)) : 0;
}

/** Focal magnification at `deltaSlots` (signed distance, in slots, from the focal
 *  line). Peaks at `loupeMax` when deltaSlots===0, decays to 1 at |deltaSlots|>=R.
 *  Source ~759: `const scale = 1 + m1*w;` where `m1 = LOUPE_MAX - 1`. */
export function magnificationAt(
  deltaSlots: number,
  loupeMax: number = LOUPE_MAX,
  R: number = LOUPE_R,
): number {
  const m1 = loupeMax - 1;
  const w = hannWeight(deltaSlots, R);
  return 1 + m1 * w;
}

/** The closed-form ODD integral of the Hann lobe, W(x). Guarantees W(0)===0 so the
 *  focal line never drifts, and W(-x)===-W(x) so parting is symmetric. Source ~761:
 *  `ax >= LOUPE_R ? Math.sign(x)*LOUPE_R/2 : 0.5*(x + (LOUPE_R/PI)*Math.sin(PI*x/LOUPE_R))`. */
export function partingIntegral(deltaSlots: number, R: number = LOUPE_R): number {
  const ax = Math.abs(deltaSlots);
  if (ax >= R) return Math.sign(deltaSlots) * (R / 2);
  return 0.5 * (deltaSlots + (R / Math.PI) * Math.sin((Math.PI * deltaSlots) / R));
}

/** Vertical offset (px) a neighbour is pushed by, so the magnified focal card never
 *  overlaps it: parting = ∫ magnification. Source ~762:
 *  `const ty = SLOT_H*m1*W;`. */
export function partingOffset(
  deltaSlots: number,
  slotH: number = SLOT_H,
  loupeMax: number = LOUPE_MAX,
  R: number = LOUPE_R,
): number {
  const m1 = loupeMax - 1;
  return slotH * m1 * partingIntegral(deltaSlots, R);
}

/** Smoothstep, clamped to [0,1]. Source ~738:
 *  `t = clamp(t,0,1); return t*t*(3-2*t);`. */
export function smoothstep01(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

/** How "revealed" a card's snippet is (0..1), blooming in only once the Hann weight
 *  crosses REVEAL_IN. Source ~763: `clamp((w - REVEAL_IN)/(1 - REVEAL_IN), 0, 1)`. */
export function revealAt(w: number, revealIn: number = REVEAL_IN): number {
  return Math.max(0, Math.min(1, (w - revealIn) / (1 - revealIn)));
}

/** Card opacity while under the loupe — a gentle focus pull that stays readable.
 *  Source ~766: `(0.85 + 0.15*smoothstep01(w)).toFixed(3)`. */
export function opacityAt(w: number): number {
  return 0.85 + 0.15 * smoothstep01(w);
}
