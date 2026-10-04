// The pure ordering/grouping layer for the sidebar. Given the raw note list and a
// view config, produce the exact sections (incl. a leading "Pinned" band) that the
// Sidebar renders. No store, no DOM — so it is trivially unit-testable, which is
// where the real correctness risk lives (stable sort, bucket boundaries, dedup).

import type { NoteMeta } from "../types";
import { effectiveGroup, type SidebarView } from "./view";

/** One rendered block: an optional header label plus its notes, already ordered. */
export interface Section {
  key: string; // stable key for React
  label: string | null; // header text; null = no header (a bare flat list)
  notes: NoteMeta[];
}

const DAY = 86_400_000;
const PINNED_KEY = "__pinned__";
const UNCATEGORISED = "Uncategorised";

/** Total, deterministic comparator. Equal sort values fall back to `id` so the
 *  output is identical regardless of the order list() happened to return. */
function compare(a: NoteMeta, b: NoteMeta, view: SidebarView): number {
  let r: number;
  if (view.sortKey === "title") {
    r = (a.title || "Untitled").localeCompare(b.title || "Untitled", undefined, {
      sensitivity: "base",
      numeric: true,
    });
  } else {
    r = (a[view.sortKey] ?? 0) - (b[view.sortKey] ?? 0);
  }
  if (r === 0) r = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return view.sortDir === "asc" ? r : -r;
}

function sorted(notes: NoteMeta[], view: SidebarView): NoteMeta[] {
  return [...notes].sort((a, b) => compare(a, b, view));
}

/** Start-of-day for a timestamp, in local time. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The date bucket a note falls into, by the field currently being sorted (so the
 *  header and the ordering never contradict each other). */
function dateBucket(note: NoteMeta, view: SidebarView, now: number): string {
  const field = view.sortKey === "createdAt" ? "createdAt" : "updatedAt";
  const today = startOfDay(now);
  const ts = note[field];
  if (ts >= today) return "Today";
  if (ts >= today - DAY) return "Yesterday";
  if (ts >= today - 7 * DAY) return "This week";
  if (ts >= today - 30 * DAY) return "This month";
  return "Earlier";
}

const DATE_ORDER = ["Today", "Yesterday", "This week", "This month", "Earlier"];

/** Bucket notes by a label fn, preserving input order within each bucket, then emit
 *  sections in the given label order — skipping any bucket that stayed empty. */
function bucketBy(
  notes: NoteMeta[],
  order: string[],
  labelOf: (n: NoteMeta) => string,
): Section[] {
  const buckets = new Map<string, NoteMeta[]>();
  for (const n of notes) {
    const label = labelOf(n);
    const arr = buckets.get(label);
    if (arr) arr.push(n);
    else buckets.set(label, [n]);
  }
  return order
    .filter((label) => buckets.has(label))
    .map((label) => ({ key: label, label, notes: buckets.get(label)! }));
}

/** Group already-sorted notes into ordered, non-empty sections for the given mode. */
function group(
  notes: NoteMeta[],
  view: SidebarView,
  now: number,
  categoryOrder: string[],
): Section[] {
  const mode = effectiveGroup(view);
  if (mode === "none") {
    return notes.length ? [{ key: "all", label: null, notes }] : [];
  }

  if (mode === "date") {
    const order = view.sortDir === "asc" ? [...DATE_ORDER].reverse() : DATE_ORDER;
    return bucketBy(notes, order, (n) => dateBucket(n, view, now));
  }

  // category: defined-category order first, then any in-use names not yet defined
  // (so nothing is ever dropped), then a trailing Uncategorised. A note with several
  // categories appears once, under its first (deterministic, no dup rows).
  const labelOf = (n: NoteMeta) => n.categories?.[0] ?? UNCATEGORISED;
  const order: string[] = [];
  for (const name of categoryOrder) if (!order.includes(name)) order.push(name);
  for (const n of notes) {
    const l = labelOf(n);
    if (l !== UNCATEGORISED && !order.includes(l)) order.push(l);
  }
  order.push(UNCATEGORISED);
  return bucketBy(notes, order, labelOf);
}

/**
 * Turn the raw note list + view into rendered sections. Pinned notes are pulled
 * into a leading "Pinned" band (in every mode) and excluded from the groups below
 * so they never appear twice. `now` is injectable for deterministic tests.
 */
export function arrange(
  notes: NoteMeta[],
  view: SidebarView,
  now: number = Date.now(),
  categoryOrder: string[] = [],
): Section[] {
  const pinned = sorted(notes.filter((n) => n.pinned), view);
  const rest = notes.filter((n) => !n.pinned);

  const sections: Section[] = [];
  if (pinned.length) {
    // The "Pinned" header only shows when there is also a non-pinned list below it,
    // so a vault of only-pinned notes doesn't carry a lonely header.
    sections.push({
      key: PINNED_KEY,
      label: rest.length ? "Pinned" : null,
      notes: pinned,
    });
  }
  sections.push(...group(sorted(rest, view), view, now, categoryOrder));
  return sections;
}
