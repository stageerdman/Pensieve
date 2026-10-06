# SEARCH — wiki (durable decisions & lessons)

## NL phrase vocabulary (local grammar — expands over time)
The parser is deterministic and calendar-correct. All date phrases resolve against an
injected `now` (testable). "Calendar-correct" ≠ rolling-N: "last month" in February means
all of January, not the last 30 days.

| Phrase (examples)                          | Resolves to (`created` range)                     |
|--------------------------------------------|---------------------------------------------------|
| today                                      | [start of today, now]                             |
| yesterday                                  | [start..end of yesterday]                          |
| today or yesterday                         | [start of yesterday, now]                          |
| this week                                  | [start of current week .. now]                     |
| last week                                  | [start..end of previous calendar week]             |
| this month                                 | [start of current month .. now]                    |
| last month                                 | [start..end of previous **calendar** month]        |
| last 30 days / last 7 days / last N days   | [now − N days, now] (rolling)                      |
| this year / last year                      | calendar year ranges                               |
| created <phrase> / added <phrase>          | same, but binds the field explicitly               |

Open question captured for later: week start (Mon vs Sun) — default **Monday**; revisit
if the owner prefers Sunday.

### Tag / category / operator grammar
- `#` begins a tag token; whispers tags-in-use; a space right after `#` escapes it to a
  literal "#" text search.
- Multi-word tags exist (e.g. `#Weekly Review`) — tag tokens may contain spaces, resolved
  greedily against known tags (longest match wins).
- Category name (e.g. "Notes & Lessons") → category-filter suggestion; Tab+Enter selects,
  plain Enter = text search of the word.
- "tag contains one of #A, #B" → a single tag filter with OR-set semantics (membership).
- Combinations parse left-to-right into multiple suggested filters (e.g.
  "#Weekly Review created last month" → tag filter + date filter).

## Filter & group model
- A **Filter** is one of: `title`, `text` (full-text), `tag` (single or one-of set),
  `category`, `dateRange` (field = created|updated), `flag` (pinned/…).
- Chips (everything except live full-text) compose in a **group tree**: leaves = filters,
  internal nodes = AND/OR. **Nesting depth = 2** (a group, and groups inside it, once).
- Colour model: inner group OR = **blue**, AND = **orange**; outer (nested) group
  OR = **purple**, AND = **red**. Default relation between ungrouped chips = AND.
- Evaluation: full-text query (if any) AND (group-tree result). Text match yields a
  snippet with context for display.

## Index decision (3000 notes incl. transcripts)
- Structured fields are already in memory (`NoteMeta`) → no index; instant.
- Full-text bodies → **in-memory inverted index** (`token → Set<id>`) plus a stripped-
  text **haystack** (`id → text`) for substring confirmation + snippet offsets. Built
  once after load, updated incrementally on save, removed on delete. Behind a
  `SearchIndex` interface (`MemoryIndex` today).
- Size reality check: 3000 notes are mostly short thoughts; only *some* are transcripts.
  Realistic total stripped text is single-digit MB (worst case tens of MB) — trivial to
  hold in memory, and an inverted index over it is a few MB. The native `list()` already
  reads every body for excerpts, so a one-shot index build on load is cheap; no startup
  blocker. (Note revises an earlier 180 MB worst-case that assumed *every* note is a 60 KB
  transcript — unrealistic.)
- Why not SQLite now: adds Rust + migration cost against "extremely lightweight", for no
  felt benefit at this scale. **Swap-in trigger:** if the cold build is ever felt (> ~1s),
  memory pressure shows, or the vault grows past ~15–20k docs / many large transcripts,
  move the index to **SQLite FTS5** in the Rust layer — the UI/query layer won't change.
- Persisted on-disk cache (keyed by `id+updatedAt`) is **deferred**: only worth it once
  the cold in-memory build is actually slow. Documented here so we don't forget the seam.

## Lessons
- **Pure logic first, React thin.** Every hard part (date math, boolean eval, parser,
  index, snippet, tree mutations) is a pure module with its own tests (98 tests) before
  any component existed. The components became thin and the invariants (no-group-of-one,
  depth-2) live in `tree.ts`, not scattered across event handlers.
- **Whisper vs. tag-set conflict.** A trailing `#Bug` inside "tag one of #A, #B" would
  trigger a single-tag whisper and mask the list. Fix: suppress the whisper when the caret
  sits inside a tag-set claim (`grammar.ts`). Caret position genuinely matters to parsing.
- **Suggestion source spans** let confirming a chip splice just its text out of the bar
  (incremental compose) instead of clearing the whole query.
- **Async index build → act() warnings** in RTL are benign but can flake a loaded parallel
  run. The cold build is cancellable (guarded setState on unmount); tests use `findBy`
  to flush. If it ever flakes hard, inject the store/index into `useSummon` for tests.
- **HTML5 drag** (not pointer math) for moving chips in/out of groups — simpler and works
  in the Tauri webview; right-click `contextmenu` is the bubble-pop trigger.
