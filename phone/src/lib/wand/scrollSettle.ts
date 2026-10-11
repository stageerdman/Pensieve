// scrollSettle.ts — pure math for the reel's "coast, then settle to the nearest
// slot" scroll feel.
//
// Ported verbatim from 01-the-wand-v2.html ~lines 779-797. CSS scroll-snap was
// dropped (it clamped flings to one card); instead the reel coasts freely on
// native momentum, then ~90ms after it goes quiet, a short JS tween eases it onto
// the nearest slot boundary. DOM-free: no rAF, no DOM — a Wave-2 hook owns the
// timer/rAF loop and writes `reel.scrollTop`.

import { SLOT_H } from "./constants";

/** Source ~779: `const easeOutCubic = t => 1 - Math.pow(1-t, 3);` */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** The slot-aligned scrollTop nearest `scrollTop`. Source ~782:
 *  `const target = Math.round(start/SLOT_H)*SLOT_H;` */
export function settleTarget(scrollTop: number, slotH: number = SLOT_H): number {
  return Math.round(scrollTop / slotH) * slotH;
}

/** Whether a settle tween is worth running at all (sub-pixel drift is skipped).
 *  Source ~783: `if(Math.abs(dist) < 1) return;` */
export function needsSettle(dist: number): boolean {
  return Math.abs(dist) >= 1;
}

/** Tween duration (ms) for a settle of `dist` px, clamped to a short, snappy range.
 *  Source ~786: `Math.min(260, Math.max(140, Math.abs(dist)*2.2))`. */
export function settleDurationMs(dist: number): number {
  return Math.min(260, Math.max(140, Math.abs(dist) * 2.2));
}

/** The eased scrollTop at `elapsedMs` into a settle tween that started at `start`
 *  and needs to cover `dist` px over `totalMs`. Source ~791-792:
 *  ```
 *  const p = Math.min(1, (now - t0)/ms);
 *  setPos = start + dist*easeOutCubic(p);
 *  ``` */
export function settleScrollAt(start: number, dist: number, elapsedMs: number, totalMs: number): number {
  const p = Math.min(1, elapsedMs / totalMs);
  return start + dist * easeOutCubic(p);
}
