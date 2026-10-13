// useReelFisheye.ts — the reel's scroll-linked vertical fisheye (THE LOUPE) + layout.
//
// Ported from 01-the-wand-v2.html ~713-815. The focal row swells into the magnified
// reading; neighbours are pushed clear by the integral of the same curve so NOTHING
// hides under the glass. All magnification is per-frame off the LIVE fractional scroll
// (f = scrollTop/SLOT_H), written DIRECTLY to DOM nodes via refs — it NEVER goes
// through React's render cycle (HARD constraint #1 / #7). The pure math is in
// lib/wand/loupeFisheye; the settle tween is useScrollSettle.

import { useEffect, useRef } from "react";
import { FOCAL_FRAC, GLASS_H, LOUPE_MAX, LOUPE_MAX_REDUCED, LOUPE_R, REVEAL_IN, SLOT_H } from "../lib/wand/constants";
import {
  fractionalFocus,
  hannWeight,
  magnificationAt,
  opacityAt,
  partingOffset,
  revealAt,
} from "../lib/wand/loupeFisheye";
import { useScrollSettle } from "./useScrollSettle";
import { haptic, prefersReducedMotion } from "../util";

export interface ReelFisheye {
  /** Recompute padding + glass geometry, then re-run the loupe. Call after the card
   *  list changes (new DOM) or on resize. */
  relayout: () => void;
}

/** @param reelRef   the scroller (.reel)
 *  @param trackRef  the inner track that holds the .slot children (.reel's first child)
 *  @param glassRef  the fixed loupe frame (.glass) */
export function useReelFisheye(
  reelRef: React.RefObject<HTMLElement>,
  trackRef: React.RefObject<HTMLElement>,
  glassRef: React.RefObject<HTMLElement>,
): ReelFisheye {
  const focusIdxRef = useRef(-1);
  const liveSlotsRef = useRef<Set<number>>(new Set());
  const api = useRef<ReelFisheye>({ relayout: () => {} });

  // updateLens needs to exist before the settle hook (its onFrame). Hold it in a ref.
  const updateLensRef = useRef<(force: boolean) => void>(() => {});
  const settle = useScrollSettle(reelRef, (force) => updateLensRef.current(force));

  useEffect(() => {
    const reel = reelRef.current;
    const track = trackRef.current;
    const glass = glassRef.current;
    if (!reel || !track || !glass) return;
    const reduce = prefersReducedMotion();
    const loupeMax = reduce ? LOUPE_MAX_REDUCED : LOUPE_MAX;

    function resetSlot(slot: Element | undefined) {
      const c = slot && (slot.firstElementChild as HTMLElement | null);
      if (!c) return;
      c.style.transform = "";
      c.style.opacity = "";
      c.style.removeProperty("--m");
      (slot as HTMLElement).style.zIndex = "";
      c.classList.remove("live");
      const sn = c.querySelector(".snippet") as HTMLElement | null;
      if (sn) {
        sn.style.opacity = "0";
        sn.style.maxHeight = "0px";
      }
    }

    function updateLens() {
      const slots = track!.children;
      const n = slots.length;
      if (!n) {
        focusIdxRef.current = -1;
        liveSlotsRef.current.clear();
        return;
      }
      const f = fractionalFocus(reel!.scrollTop);
      const lo = Math.max(0, Math.floor(f - LOUPE_R - 1));
      const hi = Math.min(n - 1, Math.ceil(f + LOUPE_R + 1));
      for (const i of Array.from(liveSlotsRef.current)) {
        if (i < lo || i > hi) {
          resetSlot(slots[i]);
          liveSlotsRef.current.delete(i);
        }
      }
      for (let i = lo; i <= hi; i++) {
        const slot = slots[i] as HTMLElement;
        const c = slot.firstElementChild as HTMLElement | null;
        if (!c) continue;
        const x = i - f;
        const w = hannWeight(x);
        const scale = magnificationAt(x, loupeMax);
        const ty = partingOffset(x, SLOT_H, loupeMax);
        const reveal = revealAt(w, REVEAL_IN);
        c.style.setProperty("--m", scale.toFixed(4));
        c.style.transform = `translateY(${ty.toFixed(2)}px)`;
        c.style.opacity = opacityAt(w).toFixed(3);
        slot.style.zIndex = String(Math.round(scale * 1000));
        c.classList.add("live");
        const sn = c.querySelector(".snippet") as HTMLElement | null;
        if (sn) {
          sn.style.opacity = reveal.toFixed(3);
          // Grow the snippet IN with reveal so the focal text block self-centres at any
          // line count. Measure its natural (3-line-clamped) height once, lazily, and
          // cache it on the node; relayout() clears the cache when wrapping can change.
          if (reveal > 0) {
            let fh = Number(sn.dataset.fh || 0);
            if (!fh) {
              sn.style.maxHeight = "none";
              fh = sn.scrollHeight;
              if (fh) sn.dataset.fh = String(fh);
            }
            sn.style.maxHeight = (reveal * fh).toFixed(1) + "px";
          } else {
            sn.style.maxHeight = "0px";
          }
        }
        liveSlotsRef.current.add(i);
      }
      focusIdxRef.current = Math.max(0, Math.min(n - 1, Math.round(f)));
    }
    updateLensRef.current = updateLens;

    function layoutReel() {
      const H = reel!.clientHeight || 500;
      const focalLineY = Math.round(H * FOCAL_FRAC);
      track!.style.paddingTop = focalLineY - SLOT_H / 2 + "px";
      track!.style.paddingBottom = Math.max(0, H - focalLineY - SLOT_H / 2) + "px";
      glass!.style.height = GLASS_H + "px";
      glass!.style.top = reel!.offsetTop + focalLineY - GLASS_H / 2 + "px";
    }

    function relayout() {
      // new DOM → forget the old window, then re-measure + repaint
      liveSlotsRef.current.clear();
      focusIdxRef.current = -1;
      // wrapping (and so a snippet's natural height) can change with the reel width —
      // drop the cached measurements so updateLens re-measures.
      track!.querySelectorAll<HTMLElement>(".snippet").forEach((el) => delete el.dataset.fh);
      layoutReel();
      updateLens();
    }
    api.current.relayout = relayout;

    // one rAF-coalesced layout per scroll frame + a velocity-gated haptic as memories
    // cross the glass, then arm the settle on quiet.
    let rafing = false,
      lastTop = 0,
      lastT = 0;
    function onScroll() {
      if (!rafing) {
        rafing = true;
        requestAnimationFrame(() => {
          const now = performance.now();
          const dt = Math.max(1, now - lastT);
          const vel = Math.abs(reel!.scrollTop - lastTop) / dt;
          lastTop = reel!.scrollTop;
          lastT = now;
          const prev = focusIdxRef.current;
          updateLens();
          if (!settle.settlingRef.current && !reduce && focusIdxRef.current !== prev && prev !== -1 && vel < 0.9) {
            haptic(8);
          }
          rafing = false;
        });
      }
      // Owner tuning 2026-10-13: the reel scrolls FREELY — no settle-to-slot snap.
      // The old JS tween fought native momentum and stuttered when two flasks shared
      // the glass. The loupe simply magnifies whatever rides the focal line, between
      // slots included. (useScrollSettle stays wired for its settlingRef guard, never
      // armed.)
    }
    reel.addEventListener("scroll", onScroll, { passive: true });

    relayout();

    return () => {
      reel.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return api.current;
}
