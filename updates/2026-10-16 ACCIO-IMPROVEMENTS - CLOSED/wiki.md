# ACCIO-IMPROVEMENTS — wiki (durable decisions & lessons)

## Engagement signals are sidecar-only, like `pinned`
`openCount` / `lastOpenedAt` live ONLY in the fast-list sidecar (Tauri `.meta.json`) /
note blob (browser) — never in `.md` frontmatter. `markOpened` bumps them without touching
the body or `updatedAt` (opening is not an edit). The trap: a note save rebuilds the sidecar
from the in-memory note, which has no live tally → it would clobber the count. Fix: both
adapters **read-merge** the persisted `openCount`/`lastOpenedAt` on `save()`. This fully
decouples open-tracking from the note object, so the in-memory count can be stale with no
consequence (it isn't displayed; disk is always right).

## Backlinks are derived, not stored
`linkedByCount` ("how many memories link to me") is computed live in `useNotes` from every
note's own `links` (which `list()` now surfaces from frontmatter). Links are explicit and
user-authored, so a reverse index would need updating on every link edit and could drift.
Deriving is always correct and needs zero migration. Owner asked to "save it as a property"
— it IS a real `NoteMeta` property, just computed rather than persisted. The future ranking
layer reads `note.linkedByCount` without caring where it came from.

## Count only DELIBERATE opens
`recordOpen` fires from `useTabs` on a flask click (`openNote`, foreground) and a tab select
(`selectTab`) — NOT the initial auto-open (which calls `open()` directly in `useNotes`) nor a
sync reload (which calls `open()` directly in `App`). Those aren't the owner choosing to work
with a memory, so they must not inflate the tally. The chokepoint matters: `open()` is shared
by all paths, so the intent split has to live one level up, at the UI event.

## Accio ordering: bucket AND sort by the same field
`bucketize(notes, now, by)` — when `by="updated"` BOTH the bucket boundary (`bucketOf`) and
the intra-bucket sort use `updatedAt`. If you sort by `updatedAt` but still bucket by
`createdAt`, a note created in March but edited today lands under "March" at the top — reads
as a bug. The date rail labels (Today/Yesterday/…) are generic and read correctly under the
new meaning ("when I last worked with it"), so **no relabeling** — confirmed by UX review.

## Working set flattens into the grid during Accio
At rest the working-set strip rides above Home and its memories are hidden from the grid. The
owner wanted a clean search space: during an active summon the strip is unmounted and its
bottles rejoin one normal grid (they naturally sort to the top — they're the most-recently
worked-with). The pinned/working-set marker on the flask is preserved, so a pinned memory
still *looks* pinned; only its location changed. Round-trip is lossless: clearing the query
restores the strip and re-hides those items. A keyed crossfade (`accio-answer-in`, 150ms,
reduced-motion aware) + scroll reset on the mode flip keeps it from reading as a glitch.

## Recent searches
- Pure logic in `lib/search/recents.ts` (load/save/add/match); state owned by `useSummon`.
- Recorded on **confirm** (the canonical `Suggestion.query`, not the decorated label) AND on
  **blur with leftover free text**. A recognized-but-unconfirmed phrase is masked out of the
  live text, so it is only remembered once actually applied — correct.
- `Suggestion.query` is the re-runnable phrase. Only needed where `label` carries display
  decoration: date claims ("Created · last 7 days" → "last 7 days"), tag-sets ("#a or #b" →
  "tags: #a, #b"), the pinned flag ("Pinned" → "pinned"). Everything else falls back to label.
- Match = case-insensitive **prefix** on the raw input (typing "las" → "last 7 days", never
  "late night"), recency order, exact-echo suppressed. 5 rows on an empty bar, 3 while typing.
- Picking a recent FILLS the bar (doesn't auto-run) — the parser re-offers it, owner confirms.
- Device-local, never synced — journaling queries are sensitive (same rule as the phone app).

## Owner spec clarifications (don't re-litigate)
- "Worked with" = **edited** (`updatedAt`), not opened. openCount is separate plumbing for
  future ranking, NOT the current sort key.
- "last 7 days first" was about ordering **suggested queries**, not memories.
