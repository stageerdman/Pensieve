# FAST-RELEVANT-SEARCH — update v1

## Goal
Typing in Accio (desktop Summon bar) feels instant on the full vault, and results come back
**ranked by relevance in one flat list — no date timeline while searching**:

1. exact / near-exact title match
2. the full phrase in the title
3. the full phrase in the body or a transcript
4. all words present (title hits weigh more than body hits)
5. partial matches (some words present)

Stop words and one-letter tokens ("I", "a", "do", "what"…) never match on their own.
Recency only breaks ties. Test case: **"What do I want today"** puts the memory with that
title first.

Done = a ranking test suite (that case + others) and a latency benchmark on a large vault,
both passing.

Scope: the desktop app (`src/`). The phone (`phone/`) has its own `rankNotes` and is not
touched here — it can adopt the shared ranker later (one import) once this lands.

## P0 — Measure the lag (done)
Spike: `spike/measure.ts` runs the real `runSearch` over the real vault (2,121 notes,
6.3 MB markdown, read-only) for every prefix of "What do I want today".

Findings (Node, M-series; the webview is no faster):
- **Search alone: 20–190 ms per keystroke**, on the main thread, on every keystroke.
  - `MemoryIndex.idsForTerm` scans the *whole vocabulary* with `token.includes(term)` for
    every term — a short term ("w", "i", "do") hits most tokens → huge id sets.
  - `makeSnippet` lower-cases the *whole body* of every body-matched note (1,400+ notes on
    "W") per keystroke → megabytes of string churn + GC pauses (the 190 ms spikes).
  - One-letter terms ("I") match almost every note, so the result set never shrinks.
- **Index build: ~2.5 s in one synchronous block** (`index.set`). It runs at idle after
  launch — any typing during that window freezes.
- **Render:** each keystroke produces a new `match` Map → the gallery window resets and
  re-buckets up to ~2,000 results by date; React renders synchronously with the input.
- Date windowing also *hides* relevant old notes: a 2023 exact-title hit sits below the
  "recent week" cutoff until you scroll.

## P1 — The ranker (pure core)
`src/lib/search/rank/`:
- `stopwords.ts` — the stop-word list (English; small, explicit).
- `queryPlan.ts` — raw text → `{ phrase, terms }`: `phrase` = all tokens (stop words kept,
  for phrase/title checks); `terms` = matchable tokens (no stop words, length ≥ 2). No terms
  → the text constrains nothing (it never matches alone).
- `rankDoc.ts` — `(plan, doc fields) → { tier, score } | null`. Tiers 0–4 above. Phrase checks
  run on a space-normalised token string; the last query token may be a prefix (typing in
  progress). Score: per term, title hit 3, tag hit 2, body hit 1; exact token beats prefix.
- `compare.ts` — order: tier ↑, starred first (keeps the owner's "starred rises" rule, but
  inside a tier so relevance wins), score ↓, updatedAt ↓, id.

Tests (`rank.test.ts`): the "What do I want today" case; exact > phrase-in-title >
phrase-in-body > all-words > partial; title weighs over body; stop words and "I" never
match alone; recency only breaks ties; transcript text counts as body.

## P2 — Fast index
`indexer.ts`:
- Prefix lookup over a **sorted vocabulary** (binary search for the prefix range) instead of
  a substring scan over every token. Semantics: a term matches a token it *starts* (`sum` →
  `summon`, `walk` → `walking`).
- Keep per doc a normalised token string (phrase checks) and a lower-cased haystack
  (snippets never lower-case at query time).
- `setAsync(docs, yield)` — the cold build in time slices (~8 ms each) that yield to the
  event loop, so typing during the build never freezes.

Tests: prefix semantics, update/remove keep the vocabulary right, sliced build equals the
one-shot build. **Benchmark** (`search.bench.test.ts`, run alone with `npm run bench` — not part of
`npm test`): a synthetic 10,000-note vault
(~5× the real one); every prefix of several queries; asserts p95 search time per keystroke
under budget.

## P3 — runSearch ranks
`search.ts` uses the plan + ranker: chips still filter (AND), text ranks (and admits partial
matches), output is in **relevance order**. Snippets come from the pre-lowered haystack.
`searchSections` (the starred date-bucket lift) is deleted — ranking replaces it.

Tests: `search.test.ts` updated for ranked order; chips + text compose.

## P4 — Flat ranked results, no timeline; input never waits
- Gallery in search mode: one flat grid in rank order, no date rail, count-windowed (first
  page mounted, a sentinel loads the next page) so the top hit is always on screen.
- `useSummon` searches a `useDeferredValue` of the query, so the keystroke paints first and
  the results follow; `FlaskCard` is memoised so unchanged cards don't re-render.
- Index cold build uses the sliced build.

Tests: Gallery search mode renders the ranked order with no date labels; Summon tests green.

## P5 — Verify
`npm test`, `npx tsc --noEmit`, the benchmark, and `spike/measure.ts` on the real vault
(before/after numbers in the wiki).

## Live status
- [x] P0 measured — causes above
- [x] P1 ranker (`rank/ranking.test.ts`; score weights shipped as title 6 / tags 3 / body 1)
- [x] P2 fast index + benchmark (sliced build is `useSearchIndex` → `setInSlices`)
- [x] P3 runSearch ranks
- [x] P4 flat ranked UI + deferred input (FlaskCard memo dropped — not needed, see wiki)
- [x] P5 verify — numbers in `wiki.md`
