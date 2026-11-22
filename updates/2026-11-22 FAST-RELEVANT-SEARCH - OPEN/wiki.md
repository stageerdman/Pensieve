# FAST-RELEVANT-SEARCH — wiki

## Before / after

Real vault (2,121 notes, 6.3 MB), every prefix of "What do I want today", `spike/measure.ts`:

|                         | Before            | After                      |
|-------------------------|-------------------|----------------------------|
| Index build             | ~2.5 s, one block | 342 ms, in ~8 ms slices    |
| Search per keystroke    | 20–190 ms         | median 0.9 ms, max 5.4 ms  |
| Top hit for full phrase | a recent note     | "What do I want today"     |

Synthetic 10k vault (`search.bench.test.ts`, almost every note matches — the worst case for
ranking): ~9 ms per keystroke on a quiet machine; it was 45–118 ms before lazy snippets,
the code-unit id sort and the phrase-miss memo. Budget: p95 < 30 ms.

## Root causes of the lag
1. A synchronous search on every keystroke, on the main thread, before the input painted.
2. Substring scan of the whole vocabulary per term — "w" or "i" hit nearly every token.
3. Snippets cut eagerly for every hit, re-lower-casing every matched body each keystroke.
4. `localeCompare` in the sort over thousands of results.
5. The whole date timeline re-bucketed and re-rendered for every result set.

## How it works now
- `rank/queryPlan.ts` → `{ phrase, terms }`; `rank/rankDoc.ts` → tier + score;
  `rank/compare.ts` → the one ordering. Pure, no index or UI.
- `indexer.ts`: sorted vocabulary, prefix lookup by binary search; `termHits` (exact/prefix
  id sets, cached until the index changes); `hasPhrase` (memoised misses).
- `search.ts`: chips filter, text ranks; snippets are cut lazily on first read (only the
  cards on screen pay).
- `useSummon` searches a `useDeferredValue` of the text; the Gallery shows one flat ranked
  grid (`role=list`, "Search results") with no date rail; Home keeps its timeline.

## Decisions
- **Starred leads within its tier**, not above it: an exact title still wins. Flip it in
  `rank/compare.ts` if the owner wants starred above everything.
- **Prefix, not substring**: "sum" finds "summon", not "consumption".
- **Stop words / one-letter words constrain nothing**: "What do I" alone shows everything,
  unranked.
- **Search results are flat**, no date rail — relevance is the order, dates would fight it.
- **`useDeferredValue` instead of debounce or a worker**: search is now ~1 ms on the real
  vault, so a debounce would only add delay and a worker would add copying.
- **FlaskCard not memoised**: the windowed grid mounts only one page of cards, so re-rendering them
  is cheap; add a memo only if a profile ever shows cards as the cost.
- **Phone out of scope**: `phone/` keeps its own `rankNotes`; it can adopt `rank/` later.
- **Benchmark is best-of-3 per keystroke and retried twice**: this machine is shared and
  timings swing 3–4× when neighbours are busy; a real regression fails every attempt.

## Run
- Ranking: `npx vitest run src/lib/search/rank`
- Benchmark: `npx vitest run src/lib/search/search.bench.test.ts`
- Real vault (read-only): `npx vite-node "updates/2026-11-22 FAST-RELEVANT-SEARCH - OPEN/spike/measure.ts" "<vault>/notes"`
- Phase timing: `npx vite-node ".../spike/phases.ts"` (vite-node, not tsx — tsx adds overhead)
