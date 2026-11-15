// FAST-LOAD — the reel's week windowing (pure). Locks in: open on the last 7 days (topped up to a
// screenful), autoload the next week near the end, unmount far sections only after 3 minutes.
import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  UNLOAD_AFTER_MS,
  extendLoadedKey,
  initialLoadedKey,
  sectionsOf,
  shownCount,
  sortNewestFirst,
  touchNear,
  unmountedKeys,
  weekKey,
} from "./feedWindow";

const NOW = new Date(2026, 10, 15, 12).getTime();
/** `perDay` notes per day for `days` days back from NOW, newest first. */
const notes = (days: number, perDay = 1) =>
  Array.from({ length: days * perDay }, (_, i) => ({ createdAt: NOW - Math.floor(i / perDay) * DAY_MS }));

describe("feedWindow", () => {
  it("week 0 is today + the 6 days before; older weeks count back from there", () => {
    expect(weekKey(NOW, NOW)).toBe(0);
    expect(weekKey(NOW - 6 * DAY_MS, NOW)).toBe(0);
    expect(weekKey(NOW - 7 * DAY_MS, NOW)).toBe(1);
    expect(weekKey(NOW + DAY_MS, NOW)).toBe(0); // clock skew never goes negative
    expect(weekKey(0, NOW)).toBeGreaterThan(1000); // undated → the very end
  });

  it("sorts newest-first by createdAt, stable for ties", () => {
    const l = [{ id: "a", createdAt: 1 }, { id: "b", createdAt: 3 }, { id: "c", createdAt: 1 }, { id: "d", createdAt: 2 }];
    expect(sortNewestFirst(l).map((n) => n.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("opens on the last 7 days when they fill the screen", () => {
    const s = sectionsOf(notes(60, 5), NOW); // 35 cards in week 0
    expect(shownCount(s, initialLoadedKey(s, 24))).toBe(35);
  });

  it("tops a sparse week up with older weeks until at least a screenful", () => {
    const s = sectionsOf(notes(200), NOW); // 7 per week
    const shown = shownCount(s, initialLoadedKey(s, 24));
    expect(shown).toBe(28); // 4 whole weeks — never a partial week
  });

  it("starts at the newest non-empty week when the last 7 days are empty", () => {
    const old = notes(30).map((n) => ({ createdAt: n.createdAt - 100 * DAY_MS }));
    const s = sectionsOf(old, NOW);
    expect(shownCount(s, initialLoadedKey(s, 5))).toBeGreaterThanOrEqual(5);
  });

  it("loads the next older week only when the focus nears the loaded end", () => {
    const s = sectionsOf(notes(200), NOW);
    const k0 = initialLoadedKey(s, 24); // 28 shown
    expect(extendLoadedKey(s, k0, 0, 8)).toBe(k0); // at the top: nothing more
    const k1 = extendLoadedKey(s, k0, 21, 8); // within a screen of the end
    expect(shownCount(s, k1)).toBe(35);
    expect(extendLoadedKey(s, k1, 21, 8)).toBe(k1); // idempotent once far enough again
    const all = extendLoadedKey(s, 0, 10_000, 8);
    expect(shownCount(s, all)).toBe(200); // never past the end
  });

  it("unmounts a far section only after 3 minutes, and remounts as soon as it is near again", () => {
    const s = sectionsOf(notes(400), NOW); // 7 per week
    const loaded = s[40].key; // 41 weeks (287 cards) loaded
    const near = new Map<number, number>();
    touchNear(s, loaded, 0, 8, NOW, near); // everything stamped at load
    // the owner scrolls deep down
    touchNear(s, loaded, 280, 8, NOW + 1000, near);
    expect(unmountedKeys(s, loaded, near, NOW + 60_000)).toEqual([]); // 1 minute: still mounted
    const later = NOW + 1000 + UNLOAD_AFTER_MS;
    touchNear(s, loaded, 280, 8, later, near);
    const off = unmountedKeys(s, loaded, near, later);
    expect(off).toContain(s[0].key); // the top weeks went away…
    expect(off).not.toContain(s[40].key); // …the ones around the focus stayed
    // scroll back to the top → the top weeks are near again → mounted
    touchNear(s, loaded, 0, 8, later + 1000, near);
    expect(unmountedKeys(s, loaded, near, later + 1000)).not.toContain(s[0].key);
  });
});
