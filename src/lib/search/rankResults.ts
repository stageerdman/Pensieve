// INTERIM relevance order for the search results list, until the backend scorer lands in
// runSearch (it will return `notes` already sorted best-first, and this file is deleted).
// Applied once, in useSummon, never in a view.
//
// Order: starred memories that matched the FREE TEXT first (owner: a starred memory is "a
// very important bright memory" and should rise "way on top"), then by match strength
// (runSearch's `rank`: title 0 > tag 1 > body 2 > filter-only 3), then most recently
// updated, then id for a stable order.

import type { SearchOutcome } from "./search";

export function rankResults(outcome: SearchOutcome): SearchOutcome {
  const { match } = outcome;
  const lift = (id: string, starred?: boolean) => (starred && match.get(id)?.where != null ? 0 : 1);
  const rank = (id: string) => match.get(id)?.rank ?? 3;
  const notes = [...outcome.notes].sort(
    (a, b) =>
      lift(a.id, a.starred) - lift(b.id, b.starred) ||
      rank(a.id) - rank(b.id) ||
      b.updatedAt - a.updatedAt ||
      a.id.localeCompare(b.id),
  );
  return { notes, match };
}
