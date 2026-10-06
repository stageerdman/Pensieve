# Pensieve — Roadmap (of updates)

The big-picture path from nothing to the full vision (see VISION.md). Each item
becomes an `updates/YYYY-MM-DD NAME - OPEN/` folder when we start it, and closes
when done. Order is priority order; later items may be re-sequenced as we learn.

Legend: [ ] not started · [~] in progress · [x] done

## Now
- [x] **INITIAL-BUILD** — the foundation + smooth writing.
  Tauri + React/TS/Tailwind/shadcn app shell; central logger; local `.md` vault
  (SQLite deferred); the TipTap editor with Notion-like formatting saving to `.md`;
  the commit-style addition timeline. Ships a real, usable writing app.
- [x] **NOTION-UX** — the block experience. Draggable blocks, `/` slash menu,
  two-level `⌘A`, inline colour/highlight on words, `@` note links; per-note
  metadata (multi-category / tags-with-whispering / relationships) as `.md`
  frontmatter in a toggle-able right sidebar; ⋯ menu for Timeline; theme in the
  native macOS menu. Keeps plain `.md` as the source of truth (colours + links
  round-trip via our own extended-Markdown standard).
- [x] **SIDEBAR-UX** — customisable notes sidebar: sort (updated/created/name,
  asc/desc), grouping (flat/date/category), per-row field toggles (relative +
  absolute times, category dots, tags, preview), and pinning — all from one `⋯`
  "Customise" popover; config persisted as a single view (named views seam left
  open). See `updates/2026-10-04 SIDEBAR-UX - CLOSED/`.

## Next (priority modalities)
- [ ] **AUDIO** — record/import audio; local whisper.cpp transcript; transcript↔
  time-point linking; segment notes; manual + AI (Claude Code CLI) transcript
  edits; cut/extract clips.
- [ ] **VIDEO** — import video; same transcript workflow as audio; embedded
  playback with time-point notes.
- [ ] **IMAGES** — embed images freely; multiple media per note; light captions/labels.

## Then (organization & intelligence — desktop AI)
- [x] **SEARCH** — the "Summon" super-search atop Home: a local NL grammar turns typed
  text into stacking filter chips (name / date / #tags / categories / flags), with tag &
  keyword whispering, full-text inside notes (highlighted snippets), a visual AND/OR
  filter-group canvas, and a custom-range calendar with a golden note-density heatmap.
  Timeline grouping preserved. Stayed in-memory (inverted index behind a `SearchIndex`
  seam — SQLite deferred until it's actually needed). See
  `updates/2026-10-04 SEARCH - CLOSED/`.
- [ ] **LABELS** — auto-labeling on capture; browse by label / date / source.
- [ ] **AI COACH** — desktop-only, via Claude Code CLI: reads your thoughts,
  surfaces past lessons, connects entries to your goals. For organizing, planning,
  and reflection — not daily logging.

## Later (capture reach & durability)
- [ ] **PHYSICAL JOURNAL IMPORT** — photograph pages; background OCR into digital
  notes; source tracking, dedup, "where you stopped"; keep hand-drawn images.
- [ ] **BACKUP** — OneDrive (Microsoft Graph) backup-only; scheduled, non-blocking.
- [ ] **iPHONE/iPAD CAPTURE** — frictionless logging app (no AI) + **our own sync**
  logic to the desktop vault.

## Someday
- [ ] **INTEGRATION** — expose Pensieve as a clean module for the bigger project.
- [ ] **DISTRIBUTION** — notarized macOS build; update mechanism.

---
Guiding rule: build each priority modality *well* before widening scope. The UI
disappears around the content; capture stays effortless; data stays local and yours.
