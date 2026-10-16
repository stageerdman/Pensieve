# ACCIO-IMPROVEMENTS — update v1

## Goal
Make Accio (desktop Summon search) better in four ways the owner asked for:

1. **Clean search space.** When an Accio query is active, hide the working-set strip and
   show *all* matching bottles together in one normal grid (including the ones normally
   pinned to the strip).
2. **Recency order during Accio.** While a query is active, order the bottles by *when I
   last worked with them* = last edited (`updatedAt`), most recent on top.
3. **Recent searches.** Remember past searches and, as I type, suggest the most-recent
   *fitting* searches first (typing "las" → "last 7 days" before anything else). Empty
   bar → most recent searches. Picking one fills the bar.
4. **Track signals for later ranking.** Start recording, per memory: how often it's been
   opened (`openCount`), and how many other memories link to it (`linkedByCount`). Plumbing
   only for now — not shown in the UI — "important for later search improvement."

Scope: **desktop app only** (`src/`). The working set + the Summon bar are desktop-only;
the phone app already has its own Accio + recents.

## Decisions (confirmed with owner)
- "Worked with" = **edited only** → sort by existing `updatedAt`. No new last-opened sort key.
- "last 7 days" ordering is about **suggested queries**, not memories: only suggest queries
  that *fit* the typed prefix, and order those by recency.
- `openCount` is **persisted** (a running tally — sidecar-only, like `pinned`, so it never
  touches `updatedAt` and is never clobbered by a note save).
- `linkedByCount` is **derived live** from every note's `links` (links are explicit
  frontmatter — computing is always correct, no migration, no staleness bug). It is exposed
  as a real `NoteMeta` property so the future ranking layer can read it.

## Roadmap (phase by phase; commit+push each)

- [ ] **P1 — Signals (openCount + linkedByCount).** No UX dep.
  - `NoteMeta`: add `openCount?`, `lastOpenedAt?`, `links?`, `linkedByCount?`.
  - `Store`: add `markOpened(id)`. Both adapters bump `openCount`/`lastOpenedAt` in the
    sidecar (Tauri) / note blob (browser) without touching `updatedAt`.
  - Both adapters: `save()` read-merges the persisted `openCount`/`lastOpenedAt` so a save
    never clobbers the running tally. `list()` surfaces them + `links`.
  - `useNotes`: `recordOpen(id)` (bump + local note patch, no disk re-list); compute
    `linkedByCount` map and attach to the returned notes.
  - `useTabs`: call `recordOpen` on *deliberate* opens only (flask click, tab select) —
    not the initial auto-open or a sync reload.
  - Tests: store markOpened + save-preserves-count; useNotes backlink count.

- [ ] **P2 — Accio layout (hide strip + recency order).** (UX input pending.)
  - `bucketize(notes, now, tsOf?)` — parametrize the timestamp selector (default `createdAt`).
  - `Gallery`: when `searchActive`, hide `WorkingSetStrip`, include working-set notes in the
    grid, and bucket/sort by `updatedAt`.
  - Tests: bucketize with the updatedAt selector.

- [ ] **P3 — Recent searches.** (UX input pending.)
  - `useRecentSearches` — localStorage-persisted, most-recent-first, capped, case-insensitive
    dedupe. Desktop-local, never synced (queries are sensitive — mirror the phone rule).
  - `Suggestion.query` — a canonical re-runnable phrase per suggestion.
  - `useSummon`: record on confirm (`s.query`) and on blur with live text; expose
    `recentMatches(prefix)` + `applyRecent(q)`.
  - `Summon` + `SuggestionList`: render recent rows on top, prefix-fit, keyboard nav through
    them into parsed suggestions.
  - Tests: recents persistence/dedupe/prefix-fit.

- [ ] **P4 — Verify + build + merge.** Typecheck, `npm test`, run the app, `tauri:build`,
  merge to `main`, rename folder `- CLOSED`.

## Status
- Starting P1.
</content>
</invoke>
