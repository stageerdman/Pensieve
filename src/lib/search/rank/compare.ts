// The one ordering of search results. Relevance decides (tier, then score: where the words hit);
// starred only breaks a relevance tie (the owner's "starred rises" rule, kept below the score so
// a title holding every typed word beats a starred note with body-only hits); then recency; the
// id keeps the order stable.

import type { Relevance } from "./rankDoc";

export interface RankedEntry {
  id: string;
  relevance: Relevance;
  starred: boolean;
  updatedAt: number;
}

export function compareRanked(a: RankedEntry, b: RankedEntry): number {
  return (
    a.relevance.tier - b.relevance.tier ||
    b.relevance.score - a.relevance.score ||
    Number(b.starred) - Number(a.starred) ||
    b.updatedAt - a.updatedAt ||
    byCodeUnit(a.id, b.id)
  );
}

// Ids only need a stable order, not a linguistic one — localeCompare made big sorts slow.
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
