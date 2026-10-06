// The full-text index behind a small interface so we can swap the backing store later
// (e.g. SQLite FTS5) without touching the query/UI layers. `MemoryIndex` keeps an
// inverted index (token → ids) for fast candidate narrowing plus a stripped-text haystack
// (id → original-case text) for substring confirmation and snippet offsets.
//
// Matching semantics: a doc matches a query if, for EVERY query term, some token in the
// doc *contains* that term as a substring (so "sum" matches "summon", "walk" matches
// "walking"). Multi-term queries AND the terms.

import { tokenize, queryTerms } from "./tokenize";

export interface IndexDoc {
  id: string;
  text: string; // stripped plain text (original casing kept for snippets)
}

export interface SearchIndex {
  /** Replace the whole index with these docs. */
  set(docs: IndexDoc[]): void;
  /** Add or replace a single doc. */
  update(id: string, text: string): void;
  /** Drop a doc. */
  remove(id: string): void;
  /** Ids matching ALL query terms. Empty query → all ids. */
  query(q: string): Set<string>;
  /** The doc's haystack text (original casing), for snippet extraction. */
  text(id: string): string | undefined;
  readonly size: number;
}

export class MemoryIndex implements SearchIndex {
  private haystack = new Map<string, string>(); // id → original-case stripped text
  private docTokens = new Map<string, Set<string>>(); // id → its unique lowercased tokens
  private inverted = new Map<string, Set<string>>(); // token → ids

  set(docs: IndexDoc[]): void {
    this.haystack.clear();
    this.docTokens.clear();
    this.inverted.clear();
    for (const d of docs) this.update(d.id, d.text);
  }

  update(id: string, text: string): void {
    this.remove(id);
    this.haystack.set(id, text);
    const tokens = new Set(tokenize(text));
    this.docTokens.set(id, tokens);
    for (const t of tokens) {
      let posting = this.inverted.get(t);
      if (!posting) this.inverted.set(t, (posting = new Set()));
      posting.add(id);
    }
  }

  remove(id: string): void {
    const tokens = this.docTokens.get(id);
    if (tokens) {
      for (const t of tokens) {
        const posting = this.inverted.get(t);
        if (posting) {
          posting.delete(id);
          if (posting.size === 0) this.inverted.delete(t);
        }
      }
    }
    this.docTokens.delete(id);
    this.haystack.delete(id);
  }

  query(q: string): Set<string> {
    const terms = queryTerms(q);
    if (terms.length === 0) return new Set(this.haystack.keys());

    let acc: Set<string> | null = null;
    for (const term of terms) {
      const ids = this.idsForTerm(term);
      if (acc === null) acc = ids;
      else acc = intersect(acc, ids);
      if (acc.size === 0) break;
    }
    return acc ?? new Set();
  }

  text(id: string): string | undefined {
    return this.haystack.get(id);
  }

  get size(): number {
    return this.haystack.size;
  }

  /** Ids whose doc has a token containing `term`. Exact token hit is O(1); otherwise we
   *  scan the token vocabulary for substring matches (cheap at personal-vault scale). */
  private idsForTerm(term: string): Set<string> {
    const exact = this.inverted.get(term);
    const out = new Set<string>(exact ?? []);
    // substring / prefix matches (e.g. "sum" → "summon"). Skip if we already have the
    // exact token and the term is long enough that a scan isn't worth it? Always scan —
    // correctness over micro-optimizing; vocab is small.
    for (const [token, ids] of this.inverted) {
      if (token === term) continue;
      if (token.includes(term)) for (const id of ids) out.add(id);
    }
    return out;
  }
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<string>();
  for (const x of small) if (big.has(x)) out.add(x);
  return out;
}
