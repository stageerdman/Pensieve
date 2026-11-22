// Relevance for one note against one query plan — pure, no index or UI knowledge.
//
// Tiers (lower = more relevant), checked in order:
//   0 TITLE_EXACT   the title IS the query (the last word may still be half-typed)
//   1 TITLE_PHRASE  the whole query appears, in order, in the title
//   2 BODY_PHRASE   the whole query appears, in order, in the body (transcripts included)
//   3 ALL_TERMS     every matchable word is somewhere (title, tags or body)
//   4 PARTIAL       some matchable words are somewhere
// Inside a tier, `score` weighs WHERE each word hit: title > tags > body, whole word > prefix.

import type { QueryPlan } from "./queryPlan";

export const Tier = { TITLE_EXACT: 0, TITLE_PHRASE: 1, BODY_PHRASE: 2, ALL_TERMS: 3, PARTIAL: 4 } as const;
export type TierValue = (typeof Tier)[keyof typeof Tier];

/** How a word hit a field: not at all, as the start of a longer word, or as a whole word. */
export const Hit = { NONE: 0, PREFIX: 1, EXACT: 2 } as const;
export type HitValue = (typeof Hit)[keyof typeof Hit];

export interface DocEvidence {
  titleNorm: string; // normalize(title)
  tagNorm: string; // normalize(tags)
  bodyHits: readonly HitValue[]; // per plan.terms, from the index
  bodyHasPhrase: () => boolean; // asked only when it can change the tier
}

export interface Relevance {
  tier: TierValue;
  score: number;
  allInTitle: boolean;
  allInTags: boolean;
}

const WEIGHT = { title: 6, tags: 3, body: 1 } as const;

/** How `term` hits a normalised field (" morning walk "). */
export function fieldHit(norm: string, term: string): HitValue {
  if (norm.includes(" " + term + " ")) return Hit.EXACT;
  return norm.includes(" " + term) ? Hit.PREFIX : Hit.NONE;
}

/** The title is the query: same words, the last query word may be a prefix of the last title word. */
function isTitleExact(titleNorm: string, phrase: string): boolean {
  return titleNorm.startsWith(phrase) && titleNorm.indexOf(" ", phrase.length) === titleNorm.length - 1;
}

/** Whole word counts fully, a prefix half. */
const hitValue = (h: HitValue) => (h === Hit.EXACT ? 1 : h === Hit.PREFIX ? 0.5 : 0);

export function rankDoc(plan: QueryPlan, ev: DocEvidence): Relevance | null {
  if (plan.terms.length === 0) return null;
  const title = plan.terms.map((t) => fieldHit(ev.titleNorm, t));
  const tags = plan.terms.map((t) => fieldHit(ev.tagNorm, t));

  let score = 0;
  let found = 0;
  plan.terms.forEach((_, i) => {
    const body = ev.bodyHits[i] ?? Hit.NONE;
    if (title[i] || tags[i] || body) found++;
    score += WEIGHT.title * hitValue(title[i]) + WEIGHT.tags * hitValue(tags[i]) + WEIGHT.body * hitValue(body);
  });
  if (found === 0) return null;

  const all = found === plan.terms.length;
  return {
    tier: tierOf(plan, ev, all),
    score,
    allInTitle: title.every(Boolean),
    allInTags: tags.every(Boolean),
  };
}

function tierOf(plan: QueryPlan, ev: DocEvidence, all: boolean): TierValue {
  if (isTitleExact(ev.titleNorm, plan.phrase)) return Tier.TITLE_EXACT;
  if (ev.titleNorm.includes(plan.phrase)) return Tier.TITLE_PHRASE;
  if (!all) return Tier.PARTIAL;
  return ev.bodyHasPhrase() ? Tier.BODY_PHRASE : Tier.ALL_TERMS;
}
