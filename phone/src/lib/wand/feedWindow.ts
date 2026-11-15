// feedWindow.ts — pure windowing for the reel (FAST-LOAD).
//
// The reel no longer mounts the whole history (2,000+ cards after the Notion import). It is cut
// into WEEK sections (week 0 = the last 7 days, counted back from the end of today):
//   - at rest only the newest weeks are loaded — week 0, plus older weeks until at least
//     `minCards` cards (a screenful) are there;
//   - when the focus gets within LOAD_AHEAD_SCREENS of the loaded end, the next older week loads;
//   - a loaded section that has been ≥ FAR_SCREENS screens from the focus for UNLOAD_AFTER_MS is
//     unmounted (its cards become same-height empty slots, so scroll never jumps), and remounts
//     the moment it comes back within range.
// Every card is the same rigid SLOT_H box, so "same-height placeholder" = an empty `.slot`, which
// also keeps the fisheye's slot index == note index.
//
// No React, no DOM — useFeedWindow is the thin hook that feeds it scroll + time.

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
/** Off-screen this long (and far enough) → unmount. Owner: "after a few minutes". */
export const UNLOAD_AFTER_MS = 3 * 60_000;
/** "Far" = this many screens away from the focus. */
export const FAR_SCREENS = 2;
/** Load the next week once the loaded end is within this many screens of the focus. */
export const LOAD_AHEAD_SCREENS = 1;
/** At rest, keep adding weeks until at least this many cards (or a screenful, if more). */
export const MIN_CARDS = 24;

export interface Datable {
  createdAt: number;
}

/** A contiguous run of the (newest-first) list sharing one week. [start, end) indices. */
export interface Section {
  key: number;
  start: number;
  end: number;
}

/** Week bucket of a note: 0 = within the last 7 days (today included), 1 = the 7 before, … */
export function weekKey(createdAt: number, now: number): number {
  const d = new Date(now);
  const endOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const t = Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0;
  return Math.max(0, Math.floor((endOfToday - 1 - t) / WEEK_MS));
}

/** Newest-first by createdAt (stable — equal times keep their vault order). */
export function sortNewestFirst<T extends Datable>(list: T[]): T[] {
  return list
    .map((n, i) => ({ n, i, t: Number.isFinite(n.createdAt) ? n.createdAt : 0 }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.n);
}

/** Cut a newest-first list into week sections. */
export function sectionsOf(list: Datable[], now: number): Section[] {
  const out: Section[] = [];
  for (let i = 0; i < list.length; i++) {
    const key = weekKey(list[i].createdAt, now);
    const last = out[out.length - 1];
    if (last && last.key === key) last.end = i + 1;
    else out.push({ key, start: i, end: i + 1 });
  }
  return out;
}

/** How many sections are loaded when every section with key ≤ loadedKey is. */
export function loadedSectionCount(sections: Section[], loadedKey: number): number {
  let n = 0;
  while (n < sections.length && sections[n].key <= loadedKey) n++;
  return n;
}

/** Cards rendered (mounted or placeholder) for a loadedKey. */
export function shownCount(sections: Section[], loadedKey: number): number {
  const n = loadedSectionCount(sections, loadedKey);
  return n ? sections[n - 1].end : 0;
}

/** At rest: all of week 0, then older weeks until ≥ minCards are loaded. */
export function initialLoadedKey(sections: Section[], minCards = MIN_CARDS): number {
  let key = 0;
  for (const s of sections) {
    key = s.key;
    if (s.end >= minCards) break;
  }
  return key;
}

/** Load more older weeks while the loaded end is within LOAD_AHEAD_SCREENS of the focus. */
export function extendLoadedKey(sections: Section[], loadedKey: number, focusIdx: number, screenSlots: number): number {
  let n = loadedSectionCount(sections, loadedKey);
  let key = loadedKey;
  const ahead = Math.max(1, screenSlots * LOAD_AHEAD_SCREENS);
  while (n < sections.length && (n ? sections[n - 1].end : 0) - focusIdx <= ahead) {
    key = sections[n].key;
    n++;
  }
  return key;
}

/** Is a section within FAR_SCREENS screens of the focus? */
export function isNear(s: Section, focusIdx: number, screenSlots: number): boolean {
  const reach = Math.max(1, screenSlots) * FAR_SCREENS;
  return s.end > focusIdx - reach && s.start <= focusIdx + reach;
}

/** Stamp "last near" for every loaded section near the focus (and first-seen ones). Mutates. */
export function touchNear(
  sections: Section[],
  loadedKey: number,
  focusIdx: number,
  screenSlots: number,
  now: number,
  lastNear: Map<number, number>,
): void {
  const n = loadedSectionCount(sections, loadedKey);
  for (let i = 0; i < n; i++) {
    const s = sections[i];
    if (!lastNear.has(s.key) || isNear(s, focusIdx, screenSlots)) lastNear.set(s.key, now);
  }
}

/** The section keys that are loaded but unmounted right now (sorted). */
export function unmountedKeys(sections: Section[], loadedKey: number, lastNear: Map<number, number>, now: number): number[] {
  const n = loadedSectionCount(sections, loadedKey);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = lastNear.get(sections[i].key);
    if (t !== undefined && now - t >= UNLOAD_AFTER_MS) out.push(sections[i].key);
  }
  return out;
}
