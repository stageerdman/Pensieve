# Update v1 — SIDEBAR-UX (customise the notes sidebar)

Status: **PLANNED — not started.** Captured from owner feedback on 2026-10-04.
No code yet; this is the brief for when we pick it up.

## Goal
Make the left notes sidebar **customisable**: how it's sorted, how it behaves, and
what's shown — rather than a fixed flat reverse-chronological list. The owner
explicitly moved "sorting" out of a one-off setting and into this broader sidebar
update, so we design the sidebar's behaviour and visible info as one coherent thing.

## Requirements (from owner)
- **Sort order, chosen by the user:** by **updated date**, **created date**, or
  **name** (asc/desc). Persist the choice.
- **Customisable behaviour:** how the sidebar behaves (e.g. what opens on click,
  grouping, density) — to be scoped during design.
- **Customisable visible info ("what we can see there"):** which fields each row
  shows — e.g. title, relative time, category, tags, a preview snippet — the owner
  should be able to turn these on/off.

## Open questions (resolve during planning)
- Where does the control live? A small inline control at the top of the sidebar
  (sort menu), vs. a settings surface. (Design minimal per design.md — likely an
  inline sort affordance + a compact "customise" popover, not a settings screen.)
- Grouping: by day/category? Or flat with a chosen sort?
- Does "behaviour" include pinning, archiving, or hiding — or is that later?
- Interaction with the future **SEARCH** update (filters may also reshape the list).

## Notes
- Current sidebar: `src/components/Sidebar.tsx` — flat, reverse-chronological by
  `updatedAt`, shows title + relative time only. `NoteMeta` already carries
  `categories` and `tags` (from NOTION-UX), so richer rows are cheap to add.
- Keep design.md discipline: every added control/field must earn its place.
- Launch UX-expert agents when we start (per CLAUDE.md workflow).
