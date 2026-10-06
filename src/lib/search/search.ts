// The orchestrator: given the note list, the stacked filter query, and the full-text
// index, produce the filtered notes plus per-note match info (why it matched + a snippet)
// for the gallery to render. Timeline grouping stays the gallery's job — we only decide
// WHICH notes survive and attach the match reason; we keep the input order so the gallery
// can group/sort by date as usual.
//
// Free-text semantics: a note matches the text query if, for EVERY term, the term appears
// in the title, the tags, or the body (via the index). Ranking classifies the match for
// display and relevance: title > tag > text (body) > structural-only.

import type { NoteMeta } from "../types";
import type { FilterQuery } from "./types";
import { matchTree, normTag, type SearchableNote } from "./evaluate";
import { queryTerms } from "./tokenize";
import { makeSnippet, type Snippet } from "./snippet";
import type { SearchIndex } from "./indexer";

export type MatchWhere = "title" | "tag" | "text";

export interface SearchResult {
  id: string;
  where: MatchWhere | null; // null when there is no free-text query
  snippet: Snippet | null; // present for body ("text") matches
  rank: number; // 0 title, 1 tag, 2 text, 3 structural-only — lower = more relevant
}

export interface SearchOutcome {
  notes: NoteMeta[]; // the filtered notes, in input order (gallery groups/sorts them)
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
  };
}

/** True when the query selects nothing (no chips, no text) — caller shows everything. */
export function isEmptyQuery(q: FilterQuery): boolean {
  return q.items.length === 0 && q.text.trim() === "";
}

export function runSearch(
  notes: NoteMeta[],
  query: FilterQuery,
  index: SearchIndex,
): SearchOutcome {
  const terms = queryTerms(query.text);
  // Per-term set of note ids whose BODY contains the term (via the index).
  const bodySets = terms.map((t) => index.query(t));

  const match = new Map<string, SearchResult>();
  const out: NoteMeta[] = [];

  for (const n of notes) {
    if (!matchTree(query.items, toSearchable(n))) continue;

    let where: MatchWhere | null = null;
    let snippet: Snippet | null = null;
    let rank = 3;

    if (terms.length > 0) {
      const titleL = n.title.toLowerCase();
      const tagsL = (n.tags ?? []).map(normTag).join(" ");
      const ok = terms.every(
        (t, i) => titleL.includes(t) || tagsL.includes(t) || bodySets[i].has(n.id),
      );
      if (!ok) continue;

      if (terms.every((t) => titleL.includes(t))) {
        where = "title";
        rank = 0;
      } else if (terms.every((t) => tagsL.includes(t))) {
        where = "tag";
        rank = 1;
      } else {
        where = "text";
        rank = 2;
        snippet = makeSnippet(index.text(n.id) ?? "", query.text);
      }
    }

    match.set(n.id, { id: n.id, where, snippet, rank });
    out.push(n);
  }

  return { notes: out, match };
}
