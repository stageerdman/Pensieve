# Update v1 — SEARCH ("Summon": a smart, magical super-search)

Status: **IN PROGRESS.** Started 2026-10-06 (owner greenlit; brief below supersedes the
2026-10-04 deferred stub). Branch `update/search`.

## Goal
A **Summon** bar living at the top of Home that turns typing into real, stacking,
*smart* filters — and a **magical, visual filter-group system** (AND/OR, nested) for
composing them. Results stay in the existing timeline-grouped flask gallery. Search
is **instant, local, offline** — no AI call on the hot path.

## Locked decisions (owner, 2026-10-06)
- **NL parsing = local deterministic grammar.** No AI on the search path. The phrase
  vocabulary expands over time (see `wiki.md`). Instant + offline + predictable.
- **Summon bar is always visible atop Home**, and focusable with **⌘S** ("summon").
  (⌘S today is a no-op save-reassurance; we repurpose it. Autosave already persists.)
- **Index:** structured filters (title/tag/category/date/flags) run over in-memory
  `NoteMeta` (zero index, instant for 3000 notes). Full-text *inside* bodies uses a
  small **in-memory inverted index**, built in the background after load, persisted to
  a vault cache keyed by `id+updatedAt`, updated incrementally on save. SQLite FTS5 is
  **deferred** behind a clean `SearchIndex` interface (swap-in trigger in `wiki.md`).
- **Scope = one update**, including the visual OR/AND groups, nesting, drag, and
  bubble-pop. **No Shelves / saved named views this update** (they don't exist yet) —
  full-text stays live in the bar; stacked filters are session-scoped chips.

## The two halves

### A. Smart "summon" input
By default searches **title + tags + body text**, ranked **title > tag > text**; a text
match shows the **matched snippet with surrounding context**. As you type, a suggestion
dropdown proposes concrete, selectable filters:
- **Date phrases** → a `created` date-range filter (calendar-correct, not rolling-N
  unless asked). e.g. "this week", "this month", "last month" (= previous calendar
  month), "last 30 days", "created last week", "today", "yesterday".
- **`#` → tag whispering** over tags-in-use (`App.tagSuggestions`). A literal `#`
  search is escaped by a space after it.
- **Category name** (e.g. "Notes") → suggests the category filter; **Tab+Enter** selects
  it as a filter, plain **Enter** searches the word as text.
- **Combinations**: "#Weekly Review created last month", "tag contains one of #Weekly
  Review, #Bug", etc.
Confirming a suggestion **stacks it as a chip** under the bar. Full-text (free text) is
**not** stacked — it lives live in the bar. A **magic "clear all" icon** wipes filters.

### B. Magical visual filter groups
Stacked chips default to **AND** between them. Visual grouping:
- **Shift-click two chips** → choose **OR (blue)** or **AND (orange)** → they become a
  group. Groups can nest **once** (group within a group); the outer group colours:
  **OR = purple, AND = red**.
- **Drag** chips in/out of groups.
- **Right-click a chip and release** → it **pops like a bubble** and is removed. If it
  was in a group of exactly two, the group dissolves (no group of one).
- Looks magical/fun/simple — glow, silver trails, bubble physics — on the design tokens.

## Phased roadmap
- **Phase 0 — UX concepts + spikes.** Parallel UX-expert agents produce HTML mockups
  for (a) the summon bar + suggestion dropdown + stacked chips, and (b) the OR/AND group
  interaction. NL-grammar spike → phrase table in `wiki.md`. Synthesize; owner check-in.
- **Phase 1 — Query model + NL grammar (pure, tested).** `lib/search/`: filter types,
  the group tree (AND/OR + one-level nesting), the parser (tokens + NL phrases →
  suggested filters), the evaluator (tree + note → match) and ranking. Deterministic,
  `now`-injected, heavily unit-tested against the phrase table.
- **Phase 2 — Full-text index.** `SearchIndex` interface + in-memory inverted index +
  persisted cache + background build + incremental update on save; snippet/context
  extraction. Tested.
- **Phase 3 — Summon bar UI.** `features/summon/`: always-atop-Home bar, ⌘S focus, tag
  whispering, category/date suggestions, confirm→chip. Filtered results feed the Gallery
  (timeline grouping preserved; text matches show the snippet on the card).
- **Phase 4 — Visual filter groups.** Chips shelf, shift-click grouping w/ colour model,
  nesting, drag in/out, right-click bubble-pop, group-dissolve. Evaluator consumes tree.
- **Phase 5 — Polish + tests + verify + build.** Render tests; verify in the real app
  (build + render tests / gallery artifact — browser automation can't reach localhost);
  merge to main; `npm run tauri:build`.

## Live status
- [x] Branch + plan.
- [x] Phase 0 — UX concepts (`concepts/A,B,C`) + NL phrase table (`wiki.md`).
- [x] Phase 1 — query model + grammar (`lib/search/{types,dates,evaluate,grammar}`).
- [x] Phase 2 — full-text index + orchestrator (`tokenize,indexer,snippet,search`).
- [x] Phase 3 — summon bar UI + suggestions (`features/summon`, `hooks/useSummon`).
- [x] Phase 4 — visual filter groups (`tree.ts` + `FilterShelf/Chip/GroupView`).
- [x] Phase 5 — render tests + web build; **native build for owner testing**.
- **204 tests green, tsc + web build clean.** Awaiting owner testing of the native app.

## Product decisions made during build (worth a look)
- **Timeline grouping wins over relevance ordering.** The owner asked for both "timeline
  grouping still applies" AND "title > tag > text ranking". These conflict for ordering,
  so: results stay grouped by date (createdAt) as the gallery always does, and ranking is
  surfaced as a per-card **match reason** ("in title / in tag / in note") + the highlighted
  snippet — rather than re-sorting within a bucket. A relevance-first sort toggle is an easy
  follow-up if wanted.
- **Working-set strip follows the filter** (a search narrows everything, strip included).
- **⌘S** repurposed from the no-op save to "summon" (jump Home + focus the bar).

## Integration notes (from code map)
- Home renders `Gallery` with `notes: NoteMeta[]` (`App.tsx:273`), grouped by
  `bucketize` (`lib/gallery/buckets.ts`). Summon filters that list → grouping free.
- Tags-in-use: `App.tsx:125` `tagSuggestions`. Tag UI pattern: `components/TagEditor.tsx`.
- Categories: `lib/categories/defs.ts` (name + colour). Date helpers: `lib/format.ts`,
  `lib/timeline.ts`, `lib/gallery/buckets.ts` (all `now`-injected — reuse the pattern).
- Bodies via `store.load(id)`; `NoteMeta` has title/tags/categories/createdAt/updatedAt/
  excerpt. Logger: `import { log } from "lib/logger"` → `log.info("summon", event, data)`.
- Tokens in `src/index.css` (accent `216 83% 49%`, accent-glow; category palette incl.
  blue/orange/purple/red for the group colours). Match the water/halo magic vocabulary.
