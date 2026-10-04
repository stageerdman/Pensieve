# Update v2 — SIDEBAR-UX (customise the notes sidebar)

Status: **BUILDING.** Supersedes the v1 brief (scope grew after owner Q&A on
2026-10-04: pinning added, flexible flat/grouped structure, more field options
incl. absolute updated & created times, saved-views seam). Branch:
`update/sidebar-ux`.

## Goal
Make the left notes sidebar **customisable** — sort, structure, and which fields
each row shows — plus **pin** favourite notes to the top. Keep today's calm
first-run exactly as it is: the capability is opt-in, defaults unchanged.

## Owner decisions (fixed)
- **Sort:** updated date / created date / name, each asc/desc. Persisted.
- **Pinning:** pin notes to a band at the top.
- **Structure:** flexible — flat OR grouped (by date or category); adjustable.
  The config is one persisted "view"; **named saved views are out of v1** but the
  model is typed (`id`/`name`) so they are a purely additive follow-up.
- **Visible fields (toggle per row):** relative time, absolute updated time,
  absolute created time, category, tags, preview snippet. Title always on.

## Design (synthesised from 3 parallel UX experts)
- **One `⋯` "Customise" popover** in the sidebar header (reuse `OverflowMenu`
  pattern); applies live, no Apply button. The only new pixel in the header.
- **Pure arrange layer:** `src/lib/sidebar/arrange(notes, view) → Section[]` owns
  sort + grouping + the pinned band. Hard-coded `.sort()` leaves both stores.
- **Pinned band** always first (every mode); pinned notes excluded from groups
  below; pin marker is whisper-muted (not accent). Pin via row hover + `⌘P`.
- **Rows:** title always; optional meta lines. Category → **color dot** (full name
  in tooltip; names too long for text). Tags → max 2 chips + `+N`. One timestamp
  printed inline (relative primary); extra enabled times compact/mono + tooltip.
  Preview from a stored `excerpt` (never load bodies to build the list). Active =
  accent left-bar + `surface-raised`.
- **Defaults (calm, = today):** `sort = Updated ↓`, `group = none` (flat),
  `fields = { relativeTime: true }`, everything else off.
- **Cut from v1:** named views, density toggle, grouping-by-tag. Seams preserved.

## Data model
- `NoteMeta` gains `pinned?: boolean` and `excerpt?: string`.
- `pinned` lives in the fast-list sidecar (`.meta.json` for Tauri, note JSON for
  browser) so the list shows pin state without reading bodies. `excerpt` likewise
  computed on save (Markdown-stripped, ~140 chars).
- `SidebarView` config persists to `localStorage` key `pensieve:sidebar:view`
  (device-local UI pref, not vault data), merged over `DEFAULT_VIEW` on load.

## Roadmap (phase by phase; commit+push each)
- **P1 — Core model + arrange (pure, tested).** `src/lib/sidebar/{view,arrange,
  persist}.ts`; extend `NoteMeta`; remove store `.sort()`; populate `excerpt`/
  `pinned` in both stores + `Note`. Unit tests for arrange/effectiveGroup/persist.
- **P2 — Pinning data path.** `pinned` on `Note` + sidecars; `togglePin(id)` in
  `useNotes` (any note, persist immediately); store tests.
- **P3 — Sidebar UI rebuild.** Rebuild `Sidebar.tsx` to render `Section[]`: row
  fields, dots, chips, times, pin marker + hover-to-pin, section headers, active
  bar. Absolute-time helper + excerpt preview.
- **P4 — Customise popover + wiring.** `SidebarCustomise.tsx`; `⋯` in header;
  `App.tsx` owns `view` (load/save) + `onChangeView` + `togglePin` + `⌘P`.
- **P5 — Verify + close.** `npm test`, `tsc`, run dev browser, `tauri build`;
  update ROADMAP/issues/wiki; merge `update/sidebar-ux` → `main`, prune, rename
  folder `- CLOSED`.

## Live status
- [x] Planning + UX synthesis.
- [x] **P1** — core model + pure arrange layer + stores (sort removed; pinned/
  excerpt surfaced). Tests green.
- [x] **P2** — pinning data path (`Store.setPinned`, `useNotes.togglePin`; no
  updatedAt bump). Tests green.
- [x] **P3+P4** — Sidebar rebuilt (sections + NoteRow), `⋯` Customise popover,
  `SidebarView` persistence, `⌘P` pin shortcut. `tsc` clean, 67 tests pass,
  `npm run build` OK.
- [~] **P5** — close-out. `npm test`/`tsc`/`build` ✅. **Browser visual check
  skipped: the Claude-in-Chrome extension was disconnected this session** — logic
  is covered by unit tests + a clean native build; owner verifies the `.app`.
  Remaining: `tauri build`, docs, merge to main, push (GitHub was unreachable
  mid-session — retry).

## Follow-up round (owner testing, 2026-10-04) — DONE
Reopened after the first native test. Addressed:
- Preview shows prose only (strips fenced + inline code and `{fg}`/`{@}` sentinels);
  selectable 1/2/3 lines.
- Field toggles split into Updated/Created × relative/date; "made" prefix dropped.
- "Notes" header label removed; rows `select-none`; larger pin hit area.
- Customise popover: dividers + spacing between Sort / Group / Show.
- **Saved views** implemented (switch / rename / Save as new / delete) — persistence
  moved to `{ views[], activeId }` with legacy migration.
- **CRITICAL editor fix:** toggles & Tab-indentation were silently lost (BlockNote
  Markdown is lossy for structure). Now bridged losslessly via `pensieve:toggle` /
  `pensieve:children` fences; quotes & nested lists already worked. 73 tests pass.

## Notes for the owner (please eyeball in the native app)
- The `⋯` next to "Notes" opens Customise: Sort (click the active key to flip
  ↑/↓), Group by (None / Date / Category), and per-row field toggles. Applies live.
- Hover a row → a pin appears at the right; click to pin (or `⌘P` on the open
  note). Pinned notes rise into a "Pinned" band at the top.
- Defaults are unchanged from before (flat, newest-updated first, relative time).
