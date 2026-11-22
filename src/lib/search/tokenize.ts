// Shared tokenizer for the full-text index and query. Lowercases and splits on anything
// that isn't a letter or digit (Unicode-aware), so "summon-bar!" → ["summon", "bar"].
// No stemming; stop words and one-letter tokens are a QUERY concern (rank/queryPlan.ts) —
// the index keeps every token so phrases like "what do I want" can still be found.
// Kept pure so the index, ranker and snippet layers agree on word boundaries.

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
