// useFeedWindow.ts — the thin hook over lib/wand/feedWindow (FAST-LOAD).
//
// Feeds the pure windowing scroll position (rAF-coalesced, passive listener on the ONE reel
// scroller — no new scroll container, so PhoneApp's document touchmove guard is unaffected) and
// time (a slow interval, so a section scrolled away from unmounts even while the reel sits still).
// Re-renders only when the loaded range or the unmounted set actually changes.

import { useEffect, useMemo, useRef, useState } from "react";
import { SLOT_H } from "../lib/wand/constants";
import {
  MIN_CARDS,
  extendLoadedKey,
  initialLoadedKey,
  sectionsOf,
  shownCount,
  touchNear,
  unmountedKeys,
  type Datable,
} from "../lib/wand/feedWindow";
import { log } from "../lib/logger";

const TICK_MS = 30_000;

export interface FeedWindow {
  /** How many of the view's cards to render (mounted or placeholder). */
  shown: number;
  /** Whether card i is mounted (false → render a same-height empty slot). */
  mounted: (i: number) => boolean;
}

interface State {
  key: string | null;
  loadedKey: number;
  lastNear: Map<number, number>;
  unmounted: number[];
}

function screenSlots(reel: HTMLElement | null): number {
  return Math.max(1, Math.ceil((reel?.clientHeight || 500) / SLOT_H));
}

/** @param view      the reel's list, newest-first
 *  @param reelRef   the scroller
 *  @param offset    slots rendered BEFORE the view in the same track (Raw Memory cards)
 *  @param resetKey  a new value (the Accio query) starts again from the newest week */
export function useFeedWindow(
  view: Datable[],
  reelRef: React.RefObject<HTMLElement>,
  offset: number,
  resetKey: string,
): FeedWindow {
  const sections = useMemo(() => sectionsOf(view, Date.now()), [view]);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const st = useRef<State>({ key: null, loadedKey: 0, lastNear: new Map(), unmounted: [] });
  if (st.current.key !== resetKey) {
    st.current = {
      key: resetKey,
      loadedKey: initialLoadedKey(sections, Math.max(MIN_CARDS, screenSlots(reelRef.current))),
      lastNear: new Map(),
      unmounted: [],
    };
  }
  const [tick, setTick] = useState(0);

  const evaluate = useRef(() => {});
  evaluate.current = () => {
    const reel = reelRef.current;
    if (!reel) return;
    const s = st.current;
    const secs = sectionsRef.current;
    const screen = screenSlots(reel);
    const focus = Math.max(0, Math.round(reel.scrollTop / SLOT_H) - offsetRef.current);
    const now = Date.now();
    const loadedKey = extendLoadedKey(secs, s.loadedKey, focus, screen);
    touchNear(secs, loadedKey, focus, screen, now, s.lastNear);
    const unmounted = unmountedKeys(secs, loadedKey, s.lastNear, now);
    const sameUnmounted = unmounted.length === s.unmounted.length && unmounted.every((k, i) => k === s.unmounted[i]);
    if (loadedKey === s.loadedKey && sameUnmounted) return;
    if (loadedKey !== s.loadedKey) log.info("feed", "load-week", { week: loadedKey, shown: shownCount(secs, loadedKey), of: view.length });
    if (!sameUnmounted) {
      const was = new Set(s.unmounted);
      const now2 = new Set(unmounted);
      const off = unmounted.filter((k) => !was.has(k));
      const on = s.unmounted.filter((k) => !now2.has(k));
      if (off.length) log.info("feed", "unmount", { weeks: off });
      if (on.length) log.info("feed", "remount", { weeks: on });
    }
    s.loadedKey = loadedKey;
    s.unmounted = unmounted;
    setTick((t) => t + 1);
  };

  // scroll (rAF-coalesced) + a slow clock for unloading while idle
  useEffect(() => {
    const reel = reelRef.current;
    if (!reel) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        evaluate.current();
      });
    };
    reel.addEventListener("scroll", onScroll, { passive: true });
    const timer = setInterval(() => evaluate.current(), TICK_MS);
    return () => {
      reel.removeEventListener("scroll", onScroll);
      clearInterval(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reelRef]);

  // a new list (edit, sync, filter) may be short of a screenful → top it up
  useEffect(() => {
    evaluate.current();
  }, [sections, resetKey]);

  return useMemo(() => {
    const shown = shownCount(sections, st.current.loadedKey);
    const off = new Set(st.current.unmounted);
    const mask = new Uint8Array(shown).fill(1);
    if (off.size) for (const s of sections) if (s.start < shown && off.has(s.key)) mask.fill(0, s.start, Math.min(s.end, shown));
    return { shown, mounted: (i: number) => mask[i] === 1 };
    // tick: the window moved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, tick, resetKey]);
}
