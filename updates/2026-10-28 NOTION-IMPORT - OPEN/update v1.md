# Update v1 — NOTION-IMPORT (prepare the model, then migrate)

## Goal
Migrate ~1,980 notes from the owner's Notion "Pensieve" database into Pensieve.
Before writing a single importer line, **fix Pensieve's own note model** so the
destination is actually correct — the owner realised their real categorization
needs are simpler than what's seeded today, and two features (a "workbench"
read on `pinned`, and a new `starred` importance signal) need to exist first so
the import has somewhere correct to land.

Full Notion-side survey (field inventory, counts, sampled content) lives in the
auto-memory note `notion-migration-readiness` from the conversation that started
this update — not duplicated here; `wiki.md` carries only the decisions that
came out of it.

## Decisions (owner, 2026-10-28)
- **Categories = "what kind of note is it."** Collapsing to exactly three real
  types: **Journal** (real journal/reflection), **Execution** (work notes — "a
  bunch of things I just write"), **Idea** (includes books — "a book is
  basically an Idea" that later accumulates links to many Execution/Journal/Idea
  pieces). Lessons-extracted-from-people and book-excerpts are explicitly *not*
  categories anymore — "anything else is not really usable."
- **Trash** stays as a 4th bucket, but it's a *utility* pen, not a note type —
  owner chose "keep it as a 4th utility bucket" when asked.
- **Memory** (1 real note) folds into Journal and disappears as a category name
  — owner chose "fold into Journal, drop the name" when asked.
- **Tags** = descriptive, two jobs: (1) label core topics in the text (the
  existing free-tag-with-whisper system — no change needed, it already does
  this), (2) mark membership in a named project/thread via an `@Prefix` tag
  (e.g. `@CANI`) — also already representable as an ordinary tag, no schema
  change needed, just a naming convention to carry over from Notion's `Dags`.
- **Pinned** is *not* "important" — it means **workbench**: the current
  working set (already implemented, see `WorkingSetStrip`). No change to its
  meaning; just confirming the name match so Notion's `Highlight: 📌` maps here.
- **Starred = NEW.** "A very important bright memory" — distinct from pinned.
  Must (a) weight search ranking heavily so starred notes surface "way on top"
  when searching, and (b) render with a visually brighter treatment. Maps from
  Notion's `Highlight: ⭐`.

## Why this order (prepare, then export)
Importing 1,980 Notion entries into a model that's about to change again would
mean migrating twice. Build the model first on the owner's existing 94-note
vault (cheap to get right — only 10 notes have any category today, 0 use any
of the 3 currently-seeded defaults), confirm it feels right in daily use, *then*
point the importer at it.

## Phased roadmap

- [x] **P1 — Category taxonomy.** `DEFAULT_CATEGORIES` → Journal (blue) /
      Execution (green) / Idea (yellow) / Trash (gray). Migrate the owner's
      real vault: `categories.json` gets the new 4; the 7 "Ideas" notes →
      "Idea", the 1 "Memory" note → "Journal", the 2 "Trash" notes untouched.
      Back up the vault first (it lives outside git).
- [x] **P2 — `starred` data model.** Mirror `pinned` exactly: `NoteMeta.starred`
      / `Note.starred`, `Store.setStarred`, wired through both the browser and
      Tauri adapters, sidecar-only (never touches `updatedAt`, never in `.md`
      frontmatter — same reasoning as pinned).
- [ ] **P3 — `starred` surfaces.** `useNotes.toggleStar` (mirrors `togglePin`);
      a star toggle affordance next to the existing pin affordance in the
      Gallery row; a visually brighter treatment for starred notes (glow /
      warm border / filled star — exact look TBD when this phase starts).
- [ ] **P4 — Search boost.** Starred notes should dominate free-text search
      ranking ("way on top"). Needs reading how `runSearch`'s output order
      actually reaches the Gallery today (rank vs. the Gallery's own date
      grouping) before picking the mechanism — deliberately not designed yet.
- [ ] **P5 — Notion field-mapping spec.** Write the exact Notion→Pensieve
      mapping in `wiki.md` for every field this update's survey found: `Cags`
      (11 options → Journal/Execution/Idea/Trash, needs a concrete per-option
      table), `Dags` → tags, `Highlight` → pinned/starred, `Core Point`,
      `Status`, `Life Stage`, `Date Overwrite`, `Source(s)`, and the four
      relation databases (People/Skills/Self-Mastery-Skills/Results/Specific-
      Sources) which have no Pensieve equivalent today. These are open
      decisions — surface to the owner before building the importer, don't
      guess silently.
- [ ] **P6 — Importer.** `features/journal-import`: pull all 1,980 rows via
      the Notion connector, map per the P5 spec, write `.md` + frontmatter into
      the vault. Batch it (1,980 pages is a lot of individual fetches) and make
      it resumable/idempotent — a failed run halfway through must not duplicate
      notes on retry.
- [ ] **P7 — Dry run + verify.** Import into a scratch vault copy first, spot-
      check a sample across eras/categories against the Notion source, confirm
      the 94 pre-existing notes are untouched, *then* run for real.
- [ ] **P8 — Close out.** Test pass, `tauri:build`, merge to main, rename
      folder `- OPEN` → `- CLOSED`.

## Status
2026-10-28: Update created. P1+P2 done (this session) — see `wiki.md` for the
exact migration record. P3 onward not started.
