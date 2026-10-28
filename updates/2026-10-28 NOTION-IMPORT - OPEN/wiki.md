# wiki — NOTION-IMPORT

Durable decisions and lessons for this update. See `update v1.md` for the
roadmap; this file is the "why" and the reference tables.

## Category taxonomy: before → after

The owner's vault (94 notes, checked 2026-10-28) had 6 category defs but only
10 notes actually used one:

| Old name           | Real usage | New name     | Color    |
|---------------------|-----------:|--------------|----------|
| Notes & Lessons     | 0 notes    | *(removed)*  | —        |
| In my mind          | 0 notes    | *(removed)*  | —        |
| Execution           | 0 notes*   | Execution    | green    |
| Ideas               | 7 notes    | Idea         | yellow   |
| Memory              | 1 note     | Journal      | blue     |
| Trash               | 2 notes    | Trash        | gray     |
| *(new)*             | —          | Journal      | blue     |

\* "Execution" had zero *notes* using it despite being a seeded default — it's
being kept because it's one of the three real types going forward, not because
of existing usage.

Journal / Execution / Idea are **note types** (mutually exclusive-ish, what
kind of thing this is). Trash is explicitly **not** a type — it's a utility
holding pen the owner chose to keep alongside the three real ones.

Migration performed: `vault/categories.json` rewritten to the 4-entry list
above; the 7 notes with `categories: [Ideas]` → `categories: [Idea]`; the 1
note with `categories: [Memory]` → `categories: [Journal]`; the 2 `Trash`
notes left untouched. A full vault backup was taken first (vault lives outside
git, at `~/Library/Application Support/xyz.erdman.pensieve/vault` — no
version control safety net, so backup-before-edit is mandatory for any future
phase that touches it again).

## Tags: no schema change needed

Notion's `Dags` already includes both plain topic tags ("fear", "focus") and
`@Project` tags ("@🟣CANI", "@Sales Coaching"). Pensieve's `tags` field is
already a flat whispered list with no type distinction between the two — the
`@` prefix is purely a *naming convention* the owner uses, not something the
app needs to special-case. Carry Notion tags over verbatim (`@CANI` stays
`@CANI`), nothing to build here.

## Pinned vs. starred — two different axes

- **Pinned** = *workbench* — what I'm actively working on right now (already
  built: `WorkingSetStrip`). Ephemeral, task-shaped.
- **Starred** = *importance* — a permanently bright, high-signal memory that
  should dominate search ranking. Durable, significance-shaped.

They're independent booleans; a note can be neither, either, or both. Mirror
`pinned`'s existing wiring exactly for `starred` (sidecar-only field, own
`Store.setStarred`, never touches `.md` frontmatter or `updatedAt`) — see
`src/lib/store/{browser,tauri}.ts` `setPinned` for the pattern.

## Open — do not guess silently before P5

The Notion survey (see memory `notion-migration-readiness`) found several
fields with no Pensieve equivalent yet. Do not invent a mapping for these
without asking the owner when P5 starts:
- `Core Point` (a highlighted takeaway/quote per entry)
- `Status` (💭 raw / ✍🏼 refining / ✔️ done workflow state)
- `Life Stage` (childhood/career era, single-select)
- `Date Overwrite` (manual display-date override)
- The four relation databases: People, Skills, Self Mastery Skills, Results /
  Specific Sources — Pensieve only models note-to-note `links`, not typed
  relations to a separate entity database. Flatten to tags? Drop? Build real
  typed relations (bigger scope)? Unresolved.
