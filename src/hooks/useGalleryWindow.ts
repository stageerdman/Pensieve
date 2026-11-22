import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GallerySection } from "../lib/gallery/buckets";
import type { NoteMeta } from "../lib/types";
import {
  DAY_MS,
  UNLOAD_AFTER_MS,
  countWithin,
  dueToCollapse,
  extendCutoff,
  hasMoreBefore,
  initialCutoff,
  markVisibility,
  windowSections,
  type FarSince,
} from "../lib/gallery/window";
import { log } from "../lib/logger";

// FAST-LOAD: the DOM wiring for the gallery's time window (the logic is lib/gallery/window).
//  - Shows only cards at/after a cutoff; a sentinel ~1.5 screens below the last card extends
//    it one week back whenever it comes into range — silently, no button.
//  - Each rendered section is watched with a ±2-screen margin; one that stays outside it for
//    3 minutes is collapsed to its measured height (children unmounted, scroll unchanged) and
//    remounted as soon as it comes back within range.
// Without IntersectionObserver (tests / ancient engines) it degrades to "show everything".

const LOAD_MARGIN = "0px 0px 150% 0px";
const NEAR_MARGIN = "200% 0px 200% 0px";
const SWEEP_MS = 20_000;

export interface GalleryWindowArgs {
  sections: GallerySection[];
  /** Timestamp the sections are ordered by (createdAt on Home). */
  tsOf: (n: NoteMeta) => number;
  /** Changing this starts the window over (e.g. coming back from a search). */
  resetKey: unknown;
  now: number;
  rootRef: React.RefObject<HTMLElement>;
}

export function useGalleryWindow({ sections, tsOf, resetKey, now, rootRef }: GalleryWindowArgs) {
  const supported = typeof IntersectionObserver !== "undefined";

  // Every windowed card's timestamp, newest first.
  const sortedDesc = useMemo(() => {
    const ts: number[] = [];
    for (const s of sections) for (const n of s.notes) ts.push(tsOf(n));
    return ts.sort((a, b) => b - a);
  }, [sections, tsOf]);

  // null = "not extended yet" → the opening cutoff, recomputed while the list loads in.
  const [extended, setExtended] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlyMap<string, number>>(() => new Map());
  const far = useRef<FarSince>(new Map());

  const lastReset = useRef(resetKey);
  if (lastReset.current !== resetKey) {
    // Reset during render (not in an effect) so the new results never flash the old window.
    lastReset.current = resetKey;
    if (extended !== null) setExtended(null);
    if (collapsed.size) setCollapsed(new Map());
    far.current = new Map();
  }

  const cutoff = !supported ? -Infinity : (extended ?? initialCutoff(sortedDesc, now));
  const more = supported && hasMoreBefore(sortedDesc, cutoff);
  const visible = useMemo(
    () => (cutoff === -Infinity ? sections : windowSections(sections, cutoff, tsOf)),
    [sections, cutoff, tsOf],
  );

  const cutoffRef = useRef(cutoff);
  cutoffRef.current = cutoff;
  const sortedRef = useRef(sortedDesc);
  sortedRef.current = sortedDesc;

  // ── load older weeks ──────────────────────────────────────────────────────────────
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!supported || !sentinel || !more) return;
    // Recreated whenever the cutoff moves, so a sentinel that is STILL in range after a load
    // (a short week) fires again from the observer's initial callback.
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        const from = cutoffRef.current;
        const next = extendCutoff(sortedRef.current, from);
        if (next === from) return;
        setExtended(next);
        log.info("gallery", "window.load", {
          shown: countWithin(sortedRef.current, next),
          total: sortedRef.current.length,
          daysBack: Math.round((now - next) / DAY_MS),
        });
      },
      { root: rootRef.current, rootMargin: LOAD_MARGIN },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [supported, sentinel, more, cutoff, rootRef, now]);

  // ── unload far sections ─────────────────────────────────────────────────────────────
  const elements = useRef(new Map<string, HTMLElement>());
  const nearIO = useRef<IntersectionObserver | null>(null);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  const expand = useCallback((key: string) => {
    if (!collapsedRef.current.has(key)) return;
    setCollapsed((c) => {
      const next = new Map(c);
      next.delete(key);
      return next;
    });
    log.debug("gallery", "window.expand", { key });
  }, []);

  const sweep = useCallback(() => {
    const due = dueToCollapse(far.current, collapsedRef.current, Date.now(), UNLOAD_AFTER_MS);
    const heights: [string, number][] = [];
    for (const key of due) {
      const el = elements.current.get(key);
      const h = el?.getBoundingClientRect().height ?? 0;
      if (h > 0) heights.push([key, h]); // measured BEFORE unmount → scroll never jumps
    }
    if (!heights.length) return;
    setCollapsed((c) => new Map([...c, ...heights]));
    log.info("gallery", "window.collapse", { sections: heights.length, keys: heights.map(([k]) => k) });
  }, []);

  useEffect(() => {
    if (!supported) return;
    const io = new IntersectionObserver(
      (entries) => {
        const t = Date.now();
        for (const e of entries) {
          const key = (e.target as HTMLElement).dataset.windowKey;
          if (!key) continue;
          markVisibility(far.current, key, e.isIntersecting, t);
          if (e.isIntersecting) expand(key);
        }
      },
      { root: rootRef.current, rootMargin: NEAR_MARGIN },
    );
    nearIO.current = io;
    for (const el of elements.current.values()) io.observe(el);
    const timer = setInterval(sweep, SWEEP_MS);
    return () => {
      io.disconnect();
      nearIO.current = null;
      clearInterval(timer);
    };
  }, [supported, rootRef, expand, sweep]);

  // A width change reflows every grid → stored heights are stale. Remount everything; far
  // sections simply collapse again after their next 3 minutes away.
  useEffect(() => {
    const root = rootRef.current;
    if (!supported || !root || typeof ResizeObserver === "undefined") return;
    let width = root.clientWidth;
    const ro = new ResizeObserver(() => {
      if (root.clientWidth === width) return;
      width = root.clientWidth;
      if (collapsedRef.current.size) setCollapsed(new Map());
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [supported, rootRef]);

  // Stable per-key ref callbacks, so React doesn't detach/re-attach on every render.
  const refCache = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const sectionRef = useCallback((key: string) => {
    let cb = refCache.current.get(key);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        const prev = elements.current.get(key);
        if (prev && prev !== el) nearIO.current?.unobserve(prev);
        if (el) {
          elements.current.set(key, el);
          nearIO.current?.observe(el);
        } else {
          elements.current.delete(key);
          far.current.delete(key);
        }
      };
      refCache.current.set(key, cb);
    }
    return cb;
  }, []);

  return {
    sections: visible,
    /** Height to hold for a collapsed section (render no children), or undefined. */
    collapsedHeight: (key: string) => collapsed.get(key),
    sectionRef,
    /** Attach to an empty element after the last section while `hasMore`. */
    sentinelRef: setSentinel,
    hasMore: more,
  };
}
