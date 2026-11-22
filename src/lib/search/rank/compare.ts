// The one ordering of search results. Relevance first (tier, then score); a starred memory
// leads its tier (the owner's "starred rises" rule, kept inside relevance so an exact title
// still wins); recency only breaks ties; the id keeps the order stable.

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
    Number(b.starred) - Number(a.starred) ||
    b.relevance.score - a.relevance.score ||
    b.updatedAt - a.updatedAt ||
    byCodeUnit(a.id, b.id)
  );
}

// Ids only need a stable order, not a linguistic one — localeCompare made big sorts slow.
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
