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

**Correction found in P3 (2026-11-15):** `WorkingSetStrip` is NOT driven by
`NoteMeta.pinned`. The Working set is its own ordered id list in gallery state
(`lib/gallery/persist.ts`, localStorage), toggled by `w` / the bookmark menu item.
`pinned` is only ⌘P on an open note + the `pinned` search chip, with no visual. So a
Notion `📌` imported as `pinned` will NOT show in the strip — decide the mapping
(working set vs. pinned, or unify them) before P6b. DECISION FOR OWNER.

## Starred — how it shows and ranks (P3/P4, 2026-11-15)

- **Brighter = brightness, not a badge.** A static gold radial halo behind the flask
  (`components/StarHalo.tsx`, `.star-halo` in index.css, `--star-halo-alpha` token:
  0.5 light / 0.35 dark — gold washes out on white so light needs more). No corner star
  glyph: with ~119 starred cards a glyph in every corner (plus the working-set bookmark)
  turns the grid into badges. UX.md's importance axis is "near / bright".
- **Halo sizing lesson:** first try (80px, fading by 70% radius) was invisible — the
  64px flask covers it. The glow must reach PAST the glass: ~1.5× the flask (96px for
  the 64px card flask, 44px for the 28px header flask), fade to 0 at 100%. Centre it by
  translate (not `inset-0 m-auto`, which won't centre an abs box larger than its parent),
  and make the flask `relative` or the absolute halo paints over it.
- **Gold, not accent-glow:** a blue halo at rest reads as a stuck focus/hover ring.
- **Ranking is a layout, not a score.** `runSearch` already had `rank` but the Gallery
  ignored it (Accio = updatedAt date buckets). Weighting a score would change nothing
  on screen, so `lib/gallery/searchSections.ts` lifts starred FREE-TEXT matches into one
  leading "Starred" section (title > tag > body, then newest) — "way on top" and it shows
  *why* it surfaced (UX.md). Chip-only lenses stay pure date views; an all-starred result
  set gets no redundant section. Uncapped: starred ≈6% of notes, so a broad word lifts
  a manageable handful.
- **Not yet:** ranking NON-starred results by relevance (the Gallery still date-buckets
  them, so a fresh title match can sit below a same-week body match). A general
  relevance issue, separate from starred.
- **Phone:** desktop only. `phone/` doesn't read `starred` (its sync preserves the
  sidecar field). Add a phone treatment only if the owner asks.

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

## Readiness re-check — 2026-11-15

Live counts (SQL over the data source, 2,002 entries, 2023-08-10 → today, +23 since the
Oct survey): Dags on 1,363 · Source(s) 592 · Core Point 181 · Result(s) 145 · ⭐ 119 ·
Date Overwrite 79 · Categories-DB relation 79 · Life Stage 36 · People 27 · Pensieve(self)
links 22 · Specific Source(s) 15 · 📌 6 · Skill(s) 4 · Self-Mastery 1 · no Cags 113.

**Correction — bodies are NOT text-only.** A 6-page spread sample found: a PDF attachment
(`<file>`), 5 uploaded images in one page, a YouTube embed (`<video>`), a synced-block
reference, an inline child database, plus callouts / toggles / columns / quotes / to-dos and
a 155K-char page. Notion-hosted files (`notion-file-block://`) must be downloaded at import
time (signed URLs expire). Pensieve has image/gallery/video/audio/toggle blocks but no generic
file/PDF block, no callout, no columns.

Relations are rarely used (People 27, Skills 4, Self-Mastery 1) → cheap to flatten or drop;
only Result(s) (145) and Categories-DB (79) are worth a decision.

## P5 mapping spec — DECIDED by owner 2026-11-15

**Categories (Cags → Pensieve, multi-Cags keeps every distinct mapped value):**
| Notion Cags | Pensieve |
|---|---|
| 📄Execution · 🏆 Goal / Desire · 📇Database · 📙 Notes & Lessons | Execution |
| 🧠 In my mind · 🎞️ Memory Capture · 💬 About others · 💤Dream · ⚖️ Decision · 📚 Book · *(blank)* | Journal |
| 💡Ideas | Idea |

**Tags:** Dags → only the vocabulary threads (`tags.json` + merges in TAGS `notion-threads.json`,
e.g. `@🟣CANI` → `@CANI`). All descriptive Dags dropped.
**CANI Reports (433):** ordinary memories, Execution + `@CANI`.
**Result(s) (145 notes → 58 pages in a separate Results DB):** NOT imported as notes. Keep the
Notion URLs as plain links in the note, and give those notes an extra category
**"Notion Links"** so they can be found and dealt with later.
**Page→page references** (Pensieve (self) + in-body links to pages inside the export) → real
Pensieve refs: `{@noteId|title}` inline + the note's `links` list. Two-pass import (assign ids
to all pages first, then rewrite links).
**Dropped:** People, Skills, Self Mastery Skills, Source(s), Specific Source(s), Categories-DB
relation, Status, Core Point, Life Stage.
**Highlight:** ⭐ → `starred`; 📌 DROPPED (owner 2026-11-15 — Working set is its own list, old pins stale). **Date Overwrite** → `createdAt`
(Notion `Created time` → `addedAt`).
**Body content:** YouTube/video embeds → plain URL · multiple uploaded images → downloaded
into the vault; consecutive images → gallery block, images placed between text stay inline
images · synced block → its text only · PDF / file attachments → skipped, and the affected
notes listed for the owner · columns / callouts → content kept, wrapped in a
`pensieve:`-style marker so they can be rendered properly later.

**Export:** first zip (2026-11-15) was CSV-only (3 files, no bodies/images) — re-export as
Markdown & CSV, Everything, subpages + folders on.

## Importer lessons (2026-11-15)
- **Write the editor's canonical form.** Notes are built as BlockNote blocks and serialized
  with the app's own `blocksToExtendedMd` (server-side editor), then load→save looped until
  stable. Without that loop 10/35 notes differed on whitespace (trailing spaces, space after a
  hard break) — harmless, but the editor would rewrite every note on first open.
  `importer/verify.ts` re-checks every note.
- **Uploaded videos exist** in Notion bodies (not just YouTube embeds) → kept as real
  `pensieve:video` blocks. They are big: the first fetch "hung" on a page with two uploaded
  videos. Downloads get a 20-min timeout; API calls 30 s with retry.
- **Empty callouts** are Notion "write here" boxes (Hour of Power template) → blank line, not
  an empty `pensieve:callout` fence.
- Result-page titles come from the owner's CSV export (`staging/csv/`), since the Results DB
  isn't shared with the integration.

## Callouts & columns (P6c, 2026-11-15, branch `update/callouts`)
**Formats unchanged** (`lib/md/callout.ts`, `lib/md/columns.ts` own the fence text; desktop,
phone and search all import them).
- **Desktop callout = a real editable block** (`components/editor/layout/CalloutBlock.tsx`):
  `content: "inline"` = the body's first paragraph, the rest of the body = the block's
  **children** (same idea as `pensieve:toggle`). Encode serializes `[lead paragraph,
  ...children]` as ONE list with `blocksToExtendedMd`, so the body is exactly what the
  importer wrote (it built `[paragraph(callout text), ...kids]`). All 593 imported bodies
  start with a paragraph (423) or an empty one (170, ZWSP) — an empty lead becomes an empty
  line and re-encodes as the ZWSP. A body whose first block isn't a paragraph (not produced
  by the importer) gains a leading blank line on first save, then is stable.
- **One box around line + children** is pure CSS: the tint sits on BlockNote's `.bn-block`
  via `:has(> .bn-block-content[data-content-type="callout"])`, the nested group's 24px
  indent is reset (to the emoji column when there's an icon), and a numbered list directly
  inside keeps 1/2/3 (our nested-list a/b/c rule would otherwise hit it). Token `--callout-bg`.
- **Enter** in the callout's own line: BlockNote's default split would put the new line AND
  all children after the callout (outside the box). `calloutEnter.ts` moves the text after
  the caret into a new FIRST child instead; leaving the box = Enter on an empty child line
  (BlockNote un-nests it). Backspace at the start of the line = BlockNote's "turn into
  paragraph" (children stay, indented) — the natural "un-callout". Wired as a block-spec
  extension `keyboardShortcuts.Enter`, which runs before BlockNote's own Enter (tested with a
  real keydown).
- `/callout` (Basic blocks) inserts an empty, icon-less callout. No icon picker / colours.
- **Columns = read-only** (`ColumnsBlock.tsx`): the fence text rides the `md` prop verbatim
  (byte-identical by construction) and each column renders via `extendedMdToBlocks` →
  `blocksToHTMLLossy` (images resolve, lists/bold/links look native), side by side with
  `flex-wrap` so it stacks when narrow. Why not editable: BlockNote 0.55's multi-column is
  the separately-licensed `@blocknote/xl-multi-column`, and faking it with nested container
  blocks lets two Backspaces delete a whole column. 13 fences in 10 notes, 9 of them images.
- **Phone**: `callout` / `columns` NoteBlock kinds carry the fence's inner lines verbatim
  (byte-identical save); rendered read-only (`ph-media`, contentEditable=false) with the body
  through the phone's own text/list renderer; columns stack with a hairline. Found + fixed: a
  photo picked/dragged next to ANY media block called `mergeInto`, which overwrote a
  non-image block (callout, audio, rating…) with a gallery — merge is now image/gallery only.
- **Search/previews**: `lib/md/proseFences.ts` unwraps callout/columns to their text for the
  desktop excerpt + search haystack and the phone reel snippet (no `icon=`/`:::column:::`).
  Titles still skip them (every imported note starts with `# Title`).
- **Lesson — callout bodies were not at their fixed point.** The importer's load→save loop
  ran while callouts were opaque fences, so their bodies never went through it: with this
  branch, 53 of 162 callout/columns notes in the dry-run vault change on first open
  (trailing spaces, space after a hard break, one "text⏎3." split) — all stable after ONE
  more pass. Re-running `convert.ts` on this branch (it loops until stable) absorbs it;
  `verify.ts` must then show 2,002/2,002 again.
- **UX review applied:** one box on both surfaces (padding 0.5em 0.75em, radius-lg), the tint
  nudged toward the accent hue so it reads neither as sidebar nor as code (`--callout-bg`
  216 32% 95.5% / dark 220 24% 15%), emoji on the first line's baseline, an EMPTY own line
  folds away (desktop: until the caret enters it, keyed off BlockNote's
  `data-is-empty-and-focused`; phone: not drawn), phone callout/column text selectable, no
  hairline between stacked phone columns (spacing only). Kept: no desktop column divider.
- DECISIONS FOR OWNER: (1) columns read-only everywhere; (2) callouts read-only on the
  phone; (3) no icon picker — imported emoji kept, `/callout` makes a plain box; (4) a
  callout never becomes a note title.
