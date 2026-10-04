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
- (add as we build)
