// The full-text index behind a small interface so we can swap the backing store later
// (e.g. SQLite FTS5) without touching the query/UI layers. `MemoryIndex` keeps:
//  - an inverted index (token → ids) plus a sorted vocabulary, so a term finds every token it
//    STARTS ("sum" → "summon", "walk" → "walking") by binary search — never a full scan;
//  - per doc, its tokens space-joined (`normalize`), so "is the whole phrase here?" is one
//    `includes`; and the original text for snippets (lower-cased once, on first use).
// Term lookups are memoised until the next change: while typing, only the last word is new.

import { tokenize } from "./tokenize";
import { normalizeTokens } from "./rank/queryPlan";
import { Vocabulary } from "./vocabulary";

export interface IndexDoc {
  id: string;
  text: string; // stripped plain text (original casing kept for snippets)
}

/** Which docs hold a term: as a whole word, or as the start of any word (a superset). */
export interface TermHits {
  exact: ReadonlySet<string>;
  prefix: ReadonlySet<string>;
}

export interface SearchIndex {
  /** Replace the whole index with these docs. */
  set(docs: IndexDoc[]): void;
  /** The same, in time slices that yield between them, so a cold build never blocks input. */
  setInSlices(docs: IndexDoc[], pause?: () => Promise<void>): Promise<void>;
  /** Add or replace a single doc. */
  update(id: string, text: string): void;
  /** Drop a doc. */
  remove(id: string): void;
  termHits(term: string): TermHits;
  /** Does the doc contain this `planQuery` phrase (last word may be a prefix)? */
  hasPhrase(id: string, phrase: string): boolean;
  /** The doc's haystack text (original casing), for snippet extraction. */
  text(id: string): string | undefined;
  /** The same text lower-cased (cached), so snippets never lower-case a body per keystroke. */
  lowerText(id: string): string | undefined;
  readonly size: number;
}

const EMPTY: ReadonlySet<string> = new Set();
const SLICE_MS = 8;
const TERM_CACHE_MAX = 64;
const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));

export class MemoryIndex implements SearchIndex {
  private haystack = new Map<string, string>(); // id → original-case stripped text
  private lowered = new Map<string, string>(); // id → lower-cased haystack (lazy)
  private norms = new Map<string, string>(); // id → normalize(text)
  private docTokens = new Map<string, Set<string>>(); // id → its unique tokens
  private inverted = new Map<string, Set<string>>(); // token → ids
  private vocab = new Vocabulary();
  private termCache = new Map<string, TermHits>();

  set(docs: IndexDoc[]): void {
    this.clear();
    for (const d of docs) this.indexDoc(d.id, d.text);
    this.vocab.reset(this.inverted.keys());
  }

  async setInSlices(docs: IndexDoc[], pause: () => Promise<void> = nextTask): Promise<void> {
    this.clear();
    let sliceStart = performance.now();
    for (const d of docs) {
      this.indexDoc(d.id, d.text);
      if (performance.now() - sliceStart > SLICE_MS) {
        await pause();
        sliceStart = performance.now();
      }
    }
    this.vocab.reset(this.inverted.keys());
  }

  update(id: string, text: string): void {
    this.remove(id);
    for (const token of this.indexDoc(id, text)) this.vocab.add(token);
  }

  remove(id: string): void {
    this.termCache.clear();
    for (const token of this.docTokens.get(id) ?? []) {
      const posting = this.inverted.get(token);
      posting?.delete(id);
      if (posting?.size === 0) {
        this.inverted.delete(token);
        this.vocab.delete(token);
      }
    }
    this.docTokens.delete(id);
    this.haystack.delete(id);
    this.lowered.delete(id);
    this.norms.delete(id);
  }

  termHits(term: string): TermHits {
    const cached = this.termCache.get(term);
    if (cached) return cached;
    const prefix = new Set<string>();
    for (const token of this.vocab.withPrefix(term)) for (const id of this.inverted.get(token)!) prefix.add(id);
    const hits = { exact: this.inverted.get(term) ?? EMPTY, prefix };
    if (this.termCache.size >= TERM_CACHE_MAX) this.termCache.clear();
    this.termCache.set(term, hits);
    return hits;
  }

  hasPhrase(id: string, phrase: string): boolean {
    return !!phrase && (this.norms.get(id)?.includes(phrase) ?? false);
  }

  text(id: string): string | undefined {
    return this.haystack.get(id);
  }

  lowerText(id: string): string | undefined {
    let lower = this.lowered.get(id);
    if (lower === undefined) {
      const text = this.haystack.get(id);
      if (text === undefined) return undefined;
      this.lowered.set(id, (lower = text.toLowerCase()));
    }
    return lower;
  }

  get size(): number {
    return this.haystack.size;
  }

  private clear(): void {
    for (const m of [this.haystack, this.lowered, this.norms, this.docTokens, this.inverted, this.termCache]) m.clear();
    this.vocab.reset([]);
  }

  /** Index one doc's text; returns the tokens it brought that no other doc had. */
  private indexDoc(id: string, text: string): string[] {
    this.termCache.clear();
    this.haystack.set(id, text);
    const list = tokenize(text);
    this.norms.set(id, normalizeTokens(list));
    const tokens = new Set(list);
    this.docTokens.set(id, tokens);
    const fresh: string[] = [];
    for (const t of tokens) {
      let posting = this.inverted.get(t);
      if (!posting) {
        this.inverted.set(t, (posting = new Set()));
        fresh.push(t);
      }
      posting.add(id);
    }
    return fresh;
  }
}
