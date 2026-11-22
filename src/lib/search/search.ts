// The orchestrator: given the note list, the stacked filter query, and the full-text
// index, produce the matching notes IN RELEVANCE ORDER plus per-note match info (why it
// matched + a snippet) for the gallery to render as one flat ranked list.
//
// Chips (tags / dates / categories / flags) filter: a note must pass them. Free text ranks
// (rank/rankDoc.ts): every note with at least one matchable word passes, ordered exact title →
// phrase in title → phrase in body → all words → some words; recency only breaks ties. Text
// with no matchable word ("I", "what do") constrains nothing. Chips only → input order kept.

import type { NoteMeta } from "../types";
import type { FilterQuery } from "./types";
import { matchTree, normTag, type SearchableNote } from "./evaluate";
import { makeSnippet, type Snippet } from "./snippet";
import type { SearchIndex, TermHits } from "./indexer";
import { normalize, planQuery, type QueryPlan } from "./rank/queryPlan";
import { Hit, rankDoc, type HitValue, type Relevance, type TierValue } from "./rank/rankDoc";
import { compareRanked, type RankedEntry } from "./rank/compare";

export type MatchWhere = "title" | "tag" | "text";

export interface SearchResult {
  id: string;
  where: MatchWhere | null; // null when there is no free-text query
  snippet: Snippet | null; // present for body ("text") matches
  tier: TierValue | null; // rank/rankDoc Tier; null when there is no free-text query
}

export interface SearchOutcome {
  notes: NoteMeta[]; // matching notes, most relevant first (input order for chips only)
  match: Map<string, SearchResult>;
}

function toSearchable(n: NoteMeta): SearchableNote {
  return {
    id: n.id,
    title: n.title,
    tags: n.tags ?? [],
    categories: n.categories ?? [],
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    pinned: n.pinned ?? false,
    starred: n.starred ?? false,
  };
}

/** True when the query selects nothing (no chips, no text) — caller shows everything. */
export function isEmptyQuery(q: FilterQuery): boolean {
  return q.items.length === 0 && q.text.trim() === "";
}

/** True when the free text can match anything (it has a word that isn't a stop word / one letter). */
export function hasSearchableText(text: string): boolean {
  return planQuery(text).terms.length > 0;
}

export function runSearch(notes: NoteMeta[], query: FilterQuery, index: SearchIndex): SearchOutcome {
  const plan = planQuery(query.text);
  const passing = notes.filter((n) => matchTree(query.items, toSearchable(n)));
  if (plan.terms.length === 0) return unranked(passing);

  const hits = plan.terms.map((t) => index.termHits(t));
  const ranked: Array<RankedEntry & { note: NoteMeta }> = [];
  for (const n of passing) {
    const relevance = rankDoc(plan, {
      titleNorm: normalize(n.title),
      tagNorm: normalize((n.tags ?? []).map(normTag).join(" ")),
      bodyHits: hits.map((h) => bodyHit(h, n.id)),
      bodyHasPhrase: () => index.hasPhrase(n.id, plan.phrase),
    });
    if (relevance) ranked.push({ id: n.id, relevance, starred: !!n.starred, updatedAt: n.updatedAt, note: n });
  }
  ranked.sort(compareRanked);

  const match = new Map<string, SearchResult>();
  for (const r of ranked) match.set(r.id, describe(r.id, r.relevance, plan, index));
  return { notes: ranked.map((r) => r.note), match };
}

function unranked(notes: NoteMeta[]): SearchOutcome {
  const match = new Map<string, SearchResult>();
  for (const n of notes) match.set(n.id, { id: n.id, where: null, snippet: null, tier: null });
  return { notes, match };
}

function bodyHit(h: TermHits, id: string): HitValue {
  if (h.exact.has(id)) return Hit.EXACT;
  return h.prefix.has(id) ? Hit.PREFIX : Hit.NONE;
}

/** Why it matched, for the card: the title, the tags, or (with a snippet) the body. */
function describe(id: string, rel: Relevance, plan: QueryPlan, index: SearchIndex): SearchResult {
  const where: MatchWhere = rel.allInTitle ? "title" : rel.allInTags ? "tag" : "text";
  const body = where === "text" ? index.text(id) : undefined;
  const snippet = body ? makeSnippet(body, plan.terms, undefined, index.lowerText(id)) : null;
  return { id, where, snippet, tier: rel.tier };
}
