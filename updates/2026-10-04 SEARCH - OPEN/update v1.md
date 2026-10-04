# Update v1 — SEARCH (smart "super search")

Status: **PLANNED — not started, deferred.** Captured from owner feedback on
2026-10-04. The owner said search is **not needed now** — this is the brief for
when we start focusing on search. No code yet.

## Goal
A **minimal but smart** search bar for the notes list — a "super search" that lets
you search by **name, date, or tags**, and interactively build **filters**, plus
full-text search **inside** notes.

## Requirements (from owner, verbatim intent)
- One minimal search bar (not a heavy search screen).
- **Smart / structured search** that understands what you mean and offers filters:
  - Type a **date phrase** (e.g. "last month") → it **suggests selecting a date
    range** to filter by.
  - Type a **tag name** → it **suggests selecting that tag** to filter by.
  - Search by **name** (title).
  - Search by **text inside** notes (full-text over the Markdown body + transcripts
    later).
- The suggestions turn free text into concrete, selectable **filters** (date range,
  tag, …) that stack — so search becomes filter-building, not just string matching.

## Shape to explore (when we start)
- A query bar that parses tokens → chips/filters (date range, tag:…, in:title,
  text:…), with a suggestion dropdown that proposes the right filter as you type.
- Ranking: title match > tag match > body text match; recency as a tiebreaker.
- Likely needs the SQLite index (deferred since INITIAL-BUILD) for fast full-text
  search across notes + (future) transcripts. Natural place to finally add it.
- Coordinate with **SIDEBAR-UX**: active filters reshape the sidebar list; sort +
  filter should compose.

## Notes
- Data already available: `NoteMeta` has `categories`, `tags`, `createdAt`,
  `updatedAt`, `title`; bodies are the `.md` files. Tags-in-use are already computed
  for whispering (`App` → `tagSuggestions`) — reuse for tag filter suggestions.
- Keep it local-first and fast (CLAUDE.md core: extremely lightweight).
