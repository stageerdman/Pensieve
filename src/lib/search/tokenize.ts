// Shared tokenizer for the full-text index and query. Lowercases and splits on anything
// that isn't a letter or digit (Unicode-aware), so "summon-bar!" → ["summon", "bar"].
// Deliberately simple: no stemming/stop-words yet (personal vault, exact-ish recall is
// more predictable). Kept pure so the index and snippet layers agree on word boundaries.

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Split a raw query into terms (same rules). An empty query yields no terms. */
export function queryTerms(q: string): string[] {
  return tokenize(q);
}
