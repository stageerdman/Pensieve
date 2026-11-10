// Resolves the "YYYY" placeholder the AI leaves in a dateHeader when a page shows no year
// (see describePageTauri.ts's prompt) — a BATCH-level decision, not a per-page one, because
// the year might only be written on some page other than the one currently missing it (the
// owner's spec: "it's not always the first page that has the date"). Pure and order-
// independent on purpose: a page late in the batch can resolve the year for a page earlier
// in the array, which is exactly why this runs as one pass over every page's header AFTER
// all of them are known, not inline during the per-page describe loop.
//
// Rule: if ANY page in the batch shows an explicit year, every "YYYY" placeholder across
// the WHOLE batch becomes that year (ties/multiple distinct years → the most-seen year
// wins; a further tie keeps whichever appears first). If no page shows a year at all,
// "YYYY" becomes the current real year.

const YEAR_PLACEHOLDER = "YYYY";
const EXPLICIT_YEAR_RE = /\b(\d{4})\b/;

/** The explicit year a header carries, or null for a placeholder/yearless/missing header.
 *  A header containing the literal word "YYYY" is a placeholder even though "YYYY" isn't a
 *  digit sequence — checked first so it's never mistaken for "no year info at all". */
function explicitYearOf(header: string | null): string | null {
  if (!header || header.includes(YEAR_PLACEHOLDER)) return null;
  return header.match(EXPLICIT_YEAR_RE)?.[1] ?? null;
}

/** `now` is injectable for deterministic tests; defaults to the real clock. */
export function resolveYearPlaceholders(dateHeaders: (string | null)[], now: Date = new Date()): (string | null)[] {
  const counts = new Map<string, number>();
  for (const h of dateHeaders) {
    const y = explicitYearOf(h);
    if (y) counts.set(y, (counts.get(y) ?? 0) + 1);
  }

  let resolvedYear: string;
  if (counts.size === 0) {
    resolvedYear = String(now.getFullYear());
  } else {
    let best: string | null = null;
    let bestCount = -1;
    for (const h of dateHeaders) {
      const y = explicitYearOf(h);
      if (!y) continue;
      const c = counts.get(y)!;
      if (c > bestCount) {
        bestCount = c;
        best = y; // strictly-greater keeps the FIRST-seen year on a tie
      }
    }
    resolvedYear = best!;
  }

  return dateHeaders.map((h) => (h ? h.split(YEAR_PLACEHOLDER).join(resolvedYear) : h));
}
