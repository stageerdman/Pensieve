// The pure ordering/grouping layer for the gallery. Given the raw note list, produce
// the exact date-bucketed sections the gallery renders — Apple-Photos-style relative
// buckets, NEWEST ON TOP. No store, no DOM, so the boundary logic (where "Last week"
// ends, how old months are labelled and ordered) is trivially unit-testable — which is
// where the real correctness risk lives.
//
// Ordering (top -> bottom = newest -> oldest), to match "on top I want the notes from
// today, and below the older ones":
//   Today, Yesterday, Last week, Last month, <recent calendar months> … <oldest>.
// Within every bucket notes are descending by creation date (newest first), id as a
// stable tie-break. The gallery opens scrolled to the top, i.e. on the most recent.

import type { NoteMeta } from "../types";

const DAY = 86_400_000;

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** One rendered block: a date label plus its notes, already ordered. */
export interface GallerySection {
  key: string; // stable key for React
  label: string; // the rail/header date label (always present in the gallery)
  short: string; // a compact form for the narrow date rail
  notes: NoteMeta[];
}

/** Start-of-day for a timestamp, in local time. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Start-of-month for a timestamp, in local time. */
function startOfMonth(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** The label for an old (>30 days) memory's calendar-month bucket. Current year shows
 *  just the month ("February"); prior years add a 2-digit year ("Feb '26"), matching
 *  the app's absolute-date convention. */
function monthLabel(ts: number, now: number): { label: string; short: string } {
  const d = new Date(ts);
  const m = d.getMonth();
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  if (sameYear) return { label: MONTHS_FULL[m], short: MONTHS_ABBR[m] };
  const yy = String(d.getFullYear()).slice(-2);
  return { label: `${MONTHS_ABBR[m]} '${yy}`, short: `${MONTHS_ABBR[m]} '${yy}` };
}

interface Bucket {
  key: string;
  label: string;
  short: string;
  order: number; // representative timestamp; buckets sort ascending by this
}

/** Which date bucket a memory falls into, by its creation date. */
function bucketOf(note: NoteMeta, now: number): Bucket {
  const today = startOfDay(now);
  const ts = note.createdAt;
  if (ts >= today) return { key: "today", label: "Today", short: "Today", order: today };
  if (ts >= today - DAY)
    return { key: "yesterday", label: "Yesterday", short: "Yest.", order: today - DAY };
  if (ts >= today - 7 * DAY)
    return { key: "lastweek", label: "Last week", short: "Last wk", order: today - 7 * DAY };
  if (ts >= today - 30 * DAY)
    return { key: "lastmonth", label: "Last month", short: "Last mo", order: today - 30 * DAY };
  // Older than a month: one bucket per calendar month. Its start-of-month timestamp is
  // always earlier than the relative buckets' representatives above, so months always
  // sort to the top (oldest first).
  const { label, short } = monthLabel(ts, now);
  const d = new Date(ts);
  return {
    key: `m-${d.getFullYear()}-${d.getMonth()}`,
    label,
    short,
    order: startOfMonth(ts),
  };
}

/** Descending by creation date (newest first), id as a stable tie-break — so the output
 *  is identical regardless of the order list() happened to return. */
function byCreatedDesc(a: NoteMeta, b: NoteMeta): number {
  const r = b.createdAt - a.createdAt;
  if (r !== 0) return r;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Group the raw note list into ordered, non-empty date sections (oldest bucket first,
 * oldest note first within each). `now` is injectable for deterministic tests.
 */
export function bucketize(notes: NoteMeta[], now: number = Date.now()): GallerySection[] {
  const buckets = new Map<string, { meta: Bucket; notes: NoteMeta[] }>();
  for (const n of notes) {
    const b = bucketOf(n, now);
    const existing = buckets.get(b.key);
    if (existing) existing.notes.push(n);
    else buckets.set(b.key, { meta: b, notes: [n] });
  }
  return [...buckets.values()]
    .sort((a, b) => b.meta.order - a.meta.order)
    .map(({ meta, notes }) => ({
      key: meta.key,
      label: meta.label,
      short: meta.short,
      notes: [...notes].sort(byCreatedDesc),
    }));
}
