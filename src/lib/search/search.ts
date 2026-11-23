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
import { isFormTemplate } from "../forms/meta";
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
    form: isFormTemplate(n.extra),
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
  // No chips is the typing case: skip a per-note copy that would only say "yes".
  const passing = query.items.length ? notes.filter((n) => matchTree(query.items, toSearchable(n))) : notes;
  if (plan.terms.length === 0) return unranked(passing);

  const hits = plan.terms.map((t) => index.termHits(t));
  const ranked: Array<RankedEntry & { note: NoteMeta }> = [];
  for (const n of passing) {
    const { titleNorm, tagNorm } = fieldNorms(n);
    const relevance = rankDoc(plan, {
      titleNorm,
      tagNorm,
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

// A note's normalised title and tags, kept per NoteMeta object: notes are immutable records
// (an edit makes a new object), so this is re-done only for changed notes, not per keystroke.
const normCache = new WeakMap<NoteMeta, { titleNorm: string; tagNorm: string }>();
function fieldNorms(n: NoteMeta) {
  let norms = normCache.get(n);
  if (!norms) {
    norms = { titleNorm: normalize(n.title), tagNorm: normalize((n.tags ?? []).map(normTag).join(" ")) };
    normCache.set(n, norms);
  }
  return norms;
}

/** Why it matched, for the card: the title, the tags, or (with a snippet) the body. */
function describe(id: string, rel: Relevance, plan: QueryPlan, index: SearchIndex): SearchResult {
  const where: MatchWhere = rel.allInTitle ? "title" : rel.allInTags ? "tag" : "text";
  return new RankedResult(id, where, rel.tier, plan, index);
}

/** The snippet is cut on first read: only the cards on screen pay for it, not every hit. */
class RankedResult implements SearchResult {
  private cut: Snippet | null | undefined;
  constructor(
    readonly id: string,
    readonly where: MatchWhere,
    readonly tier: TierValue,
    private readonly plan: QueryPlan,
    private readonly index: SearchIndex,
  ) {}
  get snippet(): Snippet | null {
    if (this.cut === undefined) this.cut = this.where === "text" ? this.bodySnippet() : null;
    return this.cut;
  }
  private bodySnippet(): Snippet | null {
    const body = this.index.text(this.id);
    return body ? makeSnippet(body, this.plan.terms, undefined, this.index.lowerText(this.id)) : null;
  }
}
