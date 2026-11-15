// FAST-LOAD: the gallery's time window — pure, no DOM (the hook useGalleryWindow wires it).
//
// At rest the gallery shows only the recent past: the last WINDOW_DAYS days, stretched back
// until at least MIN_INITIAL cards are on screen (a sparse week still fills the view). As the
// reader nears the end, the window silently extends one more week — at least MIN_STEP more
// cards, so a gap of empty months is crossed in one step instead of firing the loader over
// and over. The window is a CUTOFF TIMESTAMP, not a card count, so a new memory landing on
// top never pushes an old one off the bottom.
//
// Separately, sections that have sat ≥ ~2 screens away for UNLOAD_AFTER_MS collapse to a
// same-height placeholder (see collapse helpers below) and remount as they come back near.

import type { GallerySection } from "./buckets";

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 7;
export const MIN_INITIAL = 24;
export const MIN_STEP = 12;
export const UNLOAD_AFTER_MS = 3 * 60_000;

export interface WindowOpts {
  days: number;
  minInitial: number;
  minStep: number;
}
export const DEFAULT_WINDOW: WindowOpts = { days: WINDOW_DAYS, minInitial: MIN_INITIAL, minStep: MIN_STEP };

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The `i`-th newest timestamp (0-based), clamped to the list; Infinity for an empty list. */
const nth = (sortedDesc: number[], i: number) =>
  sortedDesc.length ? sortedDesc[Math.min(i, sortedDesc.length - 1)] : Infinity;

/** Opening cutoff: the start of the day `days` ago, or further back if that holds fewer than
 *  `minInitial` cards. `sortedDesc` = every windowed card's timestamp, newest first. */
export function initialCutoff(sortedDesc: number[], now: number, o: WindowOpts = DEFAULT_WINDOW): number {
  const weekAgo = startOfDay(now) - o.days * DAY_MS;
  return Math.min(weekAgo, nth(sortedDesc, o.minInitial - 1));
}

/** How many cards a cutoff admits (ts ≥ cutoff). */
export function countWithin(sortedDesc: number[], cutoff: number): number {
  let lo = 0;
  let hi = sortedDesc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDesc[mid] >= cutoff) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Is anything older than the cutoff still unloaded? */
export function hasMoreBefore(sortedDesc: number[], cutoff: number): boolean {
  return sortedDesc.length > 0 && sortedDesc[sortedDesc.length - 1] < cutoff;
}

/** One loader step: one more week back from the cutoff, and at least `minStep` more cards. */
export function extendCutoff(sortedDesc: number[], cutoff: number, o: WindowOpts = DEFAULT_WINDOW): number {
  if (!hasMoreBefore(sortedDesc, cutoff)) return cutoff;
  const shown = countWithin(sortedDesc, cutoff);
  return Math.min(cutoff - o.days * DAY_MS, nth(sortedDesc, shown + o.minStep - 1));
}

/** The sections as rendered under the cutoff: cards older than it dropped, emptied sections
 *  dropped. `keepWhole` sections (Accio's lifted "Starred" lead) are never windowed. */
export function windowSections(
  sections: GallerySection[],
  cutoff: number,
  tsOf: (n: GallerySection["notes"][number]) => number,
  keepWhole: (key: string) => boolean = () => false,
): GallerySection[] {
  const out: GallerySection[] = [];
  for (const s of sections) {
    if (keepWhole(s.key)) {
      out.push(s);
      continue;
    }
    const notes = s.notes.filter((n) => tsOf(n) >= cutoff);
    if (notes.length === s.notes.length) out.push(s); // untouched → same object (memo-friendly)
    else if (notes.length) out.push({ ...s, notes });
  }
  return out;
}

// ---- unloading far-away sections -------------------------------------------------------

/** key → when the section was last seen going far (absent = near / on screen). */
export type FarSince = Map<string, number>;

/** Record an IntersectionObserver verdict for one section. Near clears it; going far stamps
 *  the time once (a repeated "still far" never resets the clock). Mutates and returns `far`. */
export function markVisibility(far: FarSince, key: string, near: boolean, now: number): FarSince {
  if (near) far.delete(key);
  else if (!far.has(key)) far.set(key, now);
  return far;
}

/** Sections that have been far for at least `ttl` and aren't collapsed yet. */
export function dueToCollapse(far: FarSince, collapsed: ReadonlyMap<string, number>, now: number, ttl = UNLOAD_AFTER_MS): string[] {
  const out: string[] = [];
  for (const [key, since] of far) if (now - since >= ttl && !collapsed.has(key)) out.push(key);
  return out;
}
