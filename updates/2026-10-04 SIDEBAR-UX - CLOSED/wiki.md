# SIDEBAR-UX — wiki (durable decisions & lessons)

## Decisions
- **Sort/group is a view concern, not a store concern.** Both `browser.ts` and
  `tauri.ts` previously hard-coded `metas.sort((a,b) => b.updatedAt - a.updatedAt)`
  in `list()`. That fights any user-chosen order and duplicates logic. `list()` now
  returns unspecified order; a pure `arrange(notes, view)` owns all ordering with a
  deterministic `id` tiebreak so output is stable regardless of list() order.
- **Pin state is per-note, lives in the fast-list sidecar.** Not in the view config
  (would make pins per-view, wrong). Stored in `.meta.json` (Tauri) / note JSON
  (browser) — the same place `list()` already reads — so the list shows pins with no
  body reads. Not placed in `.md` frontmatter to avoid touching the frontmatter
  schema and to keep listing cheap.
- **Preview needs a precomputed `excerpt`.** `list()` must stay O(1) per note, so we
  never load bodies to build the sidebar. Store a Markdown-stripped ~140-char
  excerpt on save.
- **View config is device-local (`localStorage`), not vault data.** A sidebar layout
  isn't portable note content; per-device is the right boundary (the future iPhone
  capture app must not dictate desktop grouping). Merge loaded config over
  `DEFAULT_VIEW` for forward-compat.
- **Named saved views deferred.** One active `SidebarView` ships; the type carries
  `id`/`name` so upgrading to `{ views[], activeId }` + a "Save as view…" affordance
  is additive, no migration.
- **`effectiveGroup` rule:** name-sort + date-grouping collapses to flat A–Z for
  *rendering only* (date buckets with alphabetical contents read as broken); stored
  `group` is untouched so switching back to a date sort restores buckets.

## Defaults preserve today's feel
`sort = Updated ↓`, `group = none`, `fields = { relativeTime: true }`. A thinker who
never opens the popover sees essentially today's sidebar; `⋯` is the only new pixel.

## Lessons
- **Pinning must not be an "edit".** Routing pin through `store.save()` would bump
  `updatedAt` and reorder an update-sorted list on every pin. A dedicated
  `setPinned` writes only the sidecar — body and `updatedAt` untouched.
- **One "now" per render.** The sidebar computes `now` once and threads it into
  both `arrange` (date buckets) and every row's time formatting, so a bucket header
  and its rows can never disagree about "today".
- **Row restraint via collapse, not growth.** With many field toggles on, rows cap
  at ≤2 sub-lines and one printed timestamp (others in the hover tooltip) rather
  than growing unbounded — keeps the list scannable (design.md).
- **Three UX lenses in parallel converged** (controls / model / rows). Divergences
  (default grouping, density) were the orchestrator's call; defaulting to today's
  flat view honoured "Steve-Jobs strict" while shipping the full capability opt-in.

## Follow-up from owner testing (2026-10-04)
- **BlockNote Markdown is lossy for structure, not just inline colour.** It drops
  toggle list items (→ bullets) and flattens non-list nesting (Tab-indent). The fix
  mirrors the colour approach but at the BLOCK level: bridge the unrepresentable
  cases into fenced `pensieve:toggle` / `pensieve:children` code blocks, which the
  converter round-trips VERBATIM (verified: custom language + multiline body survive
  `blocksToMarkdownLossy`→`tryParseMarkdownToBlocks`). Reconstruct on parse. Standard
  docs never get a fence, so plain `.md` stays plain.
  - Toggle body/summary are stored as real Markdown inside the fence (readable,
    inline formatting preserved because we re-parse it ourselves on load) — NOT JSON.
  - Lesson: when extending the standard, serialise inline via a throwaway paragraph
    through the converter so bold/links/colour sentinels are handled in one place.
  - Open edge: a code fence nested inside a toggle body collides with the outer
    fence (documented in issues).
- **Quote and nested lists already round-tripped** — confirmed via the app pipeline;
  only toggles and non-list nesting were actually lost.
- **Saved views shipped** after all (owner asked where they were): persistence moved
  from a single `SidebarView` to `{ views[], activeId }` with legacy migration — the
  additive upgrade the seam was designed for.
- **Preview previews prose, not source**: strip fenced + inline code and our own
  `{fg}`/`{@}` sentinels at excerpt time, so the sidebar never shows markup.
