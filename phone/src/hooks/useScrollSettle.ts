// useScrollSettle.ts — the reel's "coast, then settle to the nearest slot" tween.
//
// Ported from 01-the-wand-v2.html ~778-797. Owns the 90ms-quiet timer + the rAF
// settle loop; the pure math (target slot, duration, eased position) lives in
// lib/wand/scrollSettle. CRITICAL (round-16 lesson): a settle must NEVER fight the
// finger — track the scrollTop we last wrote and abort the instant reality diverges.

import { useEffect, useRef } from "react";
import { needsSettle, settleDurationMs, settleScrollAt, settleTarget } from "../lib/wand/scrollSettle";
import { haptic, prefersReducedMotion } from "../util";

export interface ScrollSettle {
  /** Arm a settle ~90ms after the last scroll quiets. */
  arm: () => void;
  /** True while our rAF is writing scrollTop (so the scroll handler ignores it). */
  settlingRef: React.MutableRefObject<boolean>;
  /** Cancel any pending/running settle. */
  cancel: () => void;
}

/** @param reelRef  the scroller element
 *  @param onFrame  called after each scrollTop write (updateLens) — `force` on the
 *                  final landing frame. */
export function useScrollSettle(
  reelRef: React.RefObject<HTMLElement>,
  onFrame: (force: boolean) => void,
): ScrollSettle {
  const settlingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const api = useRef<ScrollSettle>({
    settlingRef,
    arm: () => {},
    cancel: () => {},
  });

  useEffect(() => {
    const reduce = prefersReducedMotion();

    function settle() {
      const reel = reelRef.current;
      if (!reel || !reel.firstChild) return;
      // reelTrack children — settle only when there is content
      const track = reel.firstElementChild as HTMLElement | null;
      if (!track || !track.children.length) return;
      const start = reel.scrollTop;
      const target = settleTarget(start);
      const dist = target - start;
      if (!needsSettle(dist)) return;
      if (reduce) {
        reel.scrollTop = target;
        onFrameRef.current(true);
        return;
      }
      settlingRef.current = true;
      const ms = settleDurationMs(dist);
      const t0 = performance.now();
      let setPos = start; // the scrollTop WE last wrote
      const step = (now: number) => {
        if (Math.abs(reel.scrollTop - setPos) > 2) {
          settlingRef.current = false; // user re-grabbed — never fight the finger
          return;
        }
        const p = Math.min(1, (now - t0) / ms);
        setPos = settleScrollAt(start, dist, now - t0, ms);
        reel.scrollTop = setPos;
        onFrameRef.current(false);
        if (p < 1) requestAnimationFrame(step);
        else {
          setPos = target;
          reel.scrollTop = target;
          onFrameRef.current(true);
          settlingRef.current = false;
          haptic(6);
        }
      };
      requestAnimationFrame(step);
    }

    api.current.arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(settle, 90);
    };
    api.current.cancel = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      settlingRef.current = false;
    };
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return api.current;
}
