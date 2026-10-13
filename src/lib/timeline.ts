// Addition timeline — "what was added when", like commits for thoughts.
// An addition is recorded per *writing session*: a session closes when the note
// is idle for IDLE_MS or the user switches away. On close we record one entry
// with the net word delta since the session started. Pure logic here; the React
// hook drives it and persists via the Store.

import type { TimelineEntry } from "./types";

export const IDLE_MS = 2 * 60 * 1000; // 2 minutes of inactivity closes a session
export const MAX_HISTORY_DAYS = 7; // keep snapshots from the 7 most recent edit-days

/** Build a timeline entry for a closed session, or null if nothing changed. When a
 *  `markdown` snapshot is given it is attached, making the entry a restorable version
 *  (the body as it stood at session close). Omit it (legacy callers) and the entry is
 *  a pure "what changed when" marker with no restore point. */
export function makeEntry(
  startWords: number,
  endWords: number,
  startTs: number,
  isFirstEver: boolean,
  markdown?: string,
): TimelineEntry | null {
  const delta = endWords - startWords;
  if (delta === 0 && !isFirstEver) return null;
  return {
    ts: startTs,
    wordDelta: delta,
    ...(isFirstEver ? { created: true } : {}),
    ...(markdown !== undefined ? { markdown } : {}),
  };
}

/** The local-midnight timestamp for `t` — the key that buckets entries into a "day". */
function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Keep only entries that fall on the `maxDays` most recent distinct *edit-days*.
 *  "Recent" is measured against the days present in the history itself, NOT against
 *  today: if edits happened on 8 different days, the oldest day is dropped whole —
 *  however long ago the most recent edit was. Preserves input order. Pure. */
export function pruneToRecentDays(
  entries: TimelineEntry[],
  maxDays: number = MAX_HISTORY_DAYS,
): TimelineEntry[] {
  if (entries.length === 0) return entries;
  const days = [...new Set(entries.map((e) => startOfDay(e.ts)))].sort((a, b) => b - a);
  if (days.length <= maxDays) return entries;
  const keep = new Set(days.slice(0, maxDays));
  return entries.filter((e) => keep.has(startOfDay(e.ts)));
}

/** Drop every entry recorded *after* the one at `ts` (restore's destructive truncate).
 *  The matched entry itself is kept; it becomes the newest version. Entries are stored
 *  in append (chronological) order, so we sort by `ts` and keep the prefix up to and
 *  including the match. Returns the input unchanged if `ts` isn't found. Pure. */
export function truncateAfter(entries: TimelineEntry[], ts: number): TimelineEntry[] {
  const sorted = [...entries].sort((a, b) => a.ts - b.ts);
  const i = sorted.findIndex((e) => e.ts === ts);
  if (i < 0) return entries;
  return sorted.slice(0, i + 1);
}

/** Group entries by day label ("Today", "Yesterday", or a date), newest first.
 *  `now` is injected so this is deterministic and testable. */
export function groupByDay(
  entries: TimelineEntry[],
  now: number,
): { label: string; entries: TimelineEntry[] }[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOfDay(now);
  const sorted = [...entries].sort((a, b) => b.ts - a.ts);
  const groups: { label: string; entries: TimelineEntry[] }[] = [];
  let current: { label: string; entries: TimelineEntry[] } | null = null;

  for (const e of sorted) {
    const day = startOfDay(e.ts);
    let label: string;
    if (day === today) label = "Today";
    else if (day === today - dayMs) label = "Yesterday";
    else label = new Date(e.ts).toLocaleDateString();

    if (!current || current.label !== label) {
      current = { label, entries: [] };
      groups.push(current);
    }
    current.entries.push(e);
  }
  return groups;
}
