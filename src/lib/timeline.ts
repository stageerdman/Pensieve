// Addition timeline — "what was added when", like commits for thoughts.
// An addition is recorded per *writing session*: a session closes when the note
// is idle for IDLE_MS or the user switches away. On close we record one entry
// with the net word delta since the session started. Pure logic here; the React
// hook drives it and persists via the Store.

import type { TimelineEntry } from "./types";

export const IDLE_MS = 2 * 60 * 1000; // 2 minutes of inactivity closes a session

/** Build a timeline entry for a closed session, or null if nothing changed. */
export function makeEntry(
  startWords: number,
  endWords: number,
  startTs: number,
  isFirstEver: boolean,
): TimelineEntry | null {
  const delta = endWords - startWords;
  if (delta === 0 && !isFirstEver) return null;
  return {
    ts: startTs,
    wordDelta: delta,
    ...(isFirstEver ? { created: true } : {}),
  };
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
