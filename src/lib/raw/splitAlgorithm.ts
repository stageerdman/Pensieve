// The owner's exact date-splitting rule for a Raw Memory batch (see updates/2026-11-09
// RAW-MEMORY-JOURNAL/wiki.md, "DECIDED … B"), as a pure function — no AI call, no I/O.
// The AI call lives one layer up (describePage in processRawBatch.ts); this only groups
// whatever per-page signals it produced. Fully deterministic and unit-testable on its own.
//
// The rule, restated:
//   • A page normally carries at most one NEW date header, followed by its entry text.
//   • An entry runs across pages until a new date header appears or the batch ends.
//   • A page can be the END of one day's entry AND the START of the next (one physical
//     page, two memories) — it is NOT split; it is referenced by BOTH groups.
//   • Page 1 only: any text before the first date header is ignored — the first group
//     starts at the first date header seen, full stop. (Handled upstream: page 1's
//     signal should already be "first date header found", not the leading junk — this
//     function just never looks for a "group zero" on page 1.)
//   • The AI must always produce SOME date guess when genuinely unsure — a page is never
//     left ungrouped by this function; a page with no header and no open group yet
//     becomes its own `date: null` group rather than being dropped.

export interface PageSignal {
  ref: string;
  /** A NEW date header detected on this page (e.g. "Nov 4"), or null if this page carries
   *  no date header of its own — a continuation of whichever day is already open. */
  dateHeader: string | null;
  /** True when this page ALSO contains trailing text from the PREVIOUS day's entry,
   *  before the new header starts — i.e. this is the literal shared boundary page.
   *  Meaningless (ignored) on page 1 — there is no previous group to share with. */
  continuesPrevious?: boolean;
}

export interface DateGroup {
  /** The detected date label, or null for an undated leading run (AI couldn't tell and
   *  there was no open group to fall back to — see the module doc). */
  date: string | null;
  /** Ordered page refs. A ref may also be the FIRST page of the next group (shared
   *  boundary) or the LAST page of the previous one — check adjacent groups, not this
   *  array alone, to find out. */
  pages: string[];
}

/** Group an ordered batch of per-page signals into one or more date-based entries. */
export function splitByDate(pages: PageSignal[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let current: DateGroup | null = null;

  pages.forEach((page, i) => {
    const isFirst = i === 0;

    if (page.dateHeader) {
      if (!isFirst && page.continuesPrevious && current) {
        // The shared boundary page: closes the previous entry AND opens the next one.
        current.pages.push(page.ref);
      }
      current = { date: page.dateHeader, pages: [page.ref] };
      groups.push(current);
      return;
    }

    // No header on this page — a continuation of whatever's open, or (only if nothing
    // is open yet, e.g. the AI couldn't read page 1 at all) a fresh undated group.
    if (current) {
      current.pages.push(page.ref);
    } else {
      current = { date: null, pages: [page.ref] };
      groups.push(current);
    }
  });

  return groups;
}

/** True if `groups[i]`'s last page is the same physical page as `groups[i + 1]`'s first —
 *  i.e. that page is shared between two final Memories and must be duplicated, not moved,
 *  when the groups are each written out (see processRawBatch.ts / wiki.md's media note). */
export function sharesBoundary(groups: DateGroup[], i: number): boolean {
  const a = groups[i];
  const b = groups[i + 1];
  if (!a || !b || a.pages.length === 0 || b.pages.length === 0) return false;
  return a.pages[a.pages.length - 1] === b.pages[0];
}
