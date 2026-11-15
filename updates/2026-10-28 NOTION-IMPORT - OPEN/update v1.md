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
- [x] **P3 — `starred` surfaces.** (2026-11-15, branch `update/starred`, NOT merged /
      built / owner-confirmed.) `useNotes.toggleStar` shares one `toggleFlag` path with
      `togglePin` (sidecar-only, updatedAt untouched, logged `notes:star`). Toggle lives
      where the working-set toggle lives: `s` on a focused gallery card, "Star"/"Unstar"
      in the card's right-click menu (right under Working set, both now
      `menuitemcheckbox`), and "Star memory" in the open note's ⋯ menu. No always-visible
      button. **Brighter** = a static gold radial halo behind the flask (`StarHalo`,
      token `--star-halo-alpha` 0.5 light / 0.35 dark) on the gallery card AND the open
      note's flask button; `, starred` appended to aria-labels. No corner glyph.
      Also: a `starred` search chip mirroring `pinned` ("sta…" whispers it).
- [x] **P4 — Search boost.** Finding: `runSearch` computes `rank` but the Gallery threw
      it away — during Accio it date-buckets every result by updatedAt. So the boost is a
      layout, not a score: `lib/gallery/searchSections.ts` lifts every starred note that
      matched the FREE TEXT into one leading **"Starred"** section (rail label like the
      dates), ordered title > tag > body, then newest; everything else keeps its date
      bucket. Chip-only queries (`#CANI`, `last week`, `pinned`) don't lift; when every
      result is starred (e.g. `starred` chip + text) there's no redundant section. Home
      at rest is untouched. Logged `gallery:search.starredLift`.
- [ ] **P5 — Notion field-mapping spec.** Write the exact Notion→Pensieve
      mapping in `wiki.md` for every field this update's survey found: `Cags`
      (11 options → Journal/Execution/Idea/Trash, needs a concrete per-option
      table), `Dags` → tags, `Highlight` → pinned/starred, `Core Point`,
      `Status`, `Life Stage`, `Date Overwrite`, `Source(s)`, and the four
      relation databases (People/Skills/Self-Mastery-Skills/Results/Specific-
      Sources) which have no Pensieve equivalent today. These are open
      decisions — surface to the owner before building the importer, don't
      guess silently.
- [x] **P6a — Fetch.** Notion's Export gave only the table CSV, so pull via the official API:
      `importer/fetch.mjs` (newest first, ~3 req/s, resumable, streams files to disk, 60 s
      stall abort). 2,002/2,002 staged, 0 failed, 3.5 GB media in `<appdata>/notion-staging/`.
- [x] **P6-phone — Phone can hold the import (main `516008c`, deployed).** Phone notes
      localStorage (~5 MB, silently failing) → IndexedDB; video/audio download on play (+ phone
      now knows video refs). Desktop sync keeps starred/open stats on a pulled note and dates
      new notes from frontmatter `created:`. Owner device check owed.
- [x] **P6b/P7a — Convert + dry run.** `importer/convert.ts` (app's own serializer, two-pass
      refs) + `verify.ts` + `preview.ts`. 2,002/2,002 into a scratch vault copy, 0 failed,
      **2,002/2,002 byte-identical through the editor's load→save**, existing notes
      byte-identical, 0 id clashes, 72 links + 34 inline refs resolve, 119 starred, 3.2 GB.
      Owner reviewed the preview → **build callout rendering first** (593 callouts / 156 notes).
- [ ] **P6c — Callouts + columns rendering** (desktop block + phone parser) — agent on
      `update/callouts`.
- [ ] **P7b — Real import.** Owner quits the app → fresh vault backup → owner confirms the
      phone still shows its notes after the IndexedDB move → `convert.ts --vault <real>` →
      `verify.ts --vault <real>` → owner opens the app; first sync uploads ~2,000 notes +
      3.2 GB. Then owner deletes the "Pensieve import" Notion integration.
- [ ] **P8 — Close out.** Test pass, `tauri:build`, merge to main, rename
      folder `- OPEN` → `- CLOSED`.

## Status
2026-11-15: P3+P4 built on `update/starred` (see wiki "Starred — how it shows and ranks").
Needs: merge, `tauri:build`, owner look at the halo strength + the Starred section.
DECISIONS FOR OWNER: (1) halo only, no star glyph on cards; (2) every starred text match
lifts, uncapped, incl. body-only matches; (3) chip-only searches don't lift; (4) desktop
only — the phone doesn't read `starred` yet; (5) found: the Gallery "Working set" is a
separate localStorage list, NOT `NoteMeta.pinned` (⌘P) — so Notion 📌 → `pinned` will not
appear in the Working-set strip. Decide before P6b whether 📌 → working set or pinned.
2026-11-15: P5 spec DECIDED by owner (wiki.md). Vault backed up to
`vault-backup-2026-11-15-pre-notion-import`. Export zip = CSV only → API fetcher written,
waiting on the owner's integration token.
Later same day: token in place, full fetch running (resumable); phone + sync fixes shipped
(see P6-phone). Next: finish fetch → full dry-run convert + verify → owner sample review →
real import into the backed-up vault.
2026-10-28: Update created. P1+P2 done (this session) — see `wiki.md` for the
exact migration record. P3 onward not started.
