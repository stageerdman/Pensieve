# Update v1 — NOTION-UX (the markdown/block experience)

## Goal
Turn the writing surface from "markdown textarea with styling" into a genuine
**Notion-like block experience**, and restructure the app chrome to match — while
keeping the hard rule that **plain `.md` on disk stays the source of truth** (the
faithful, idempotent round-trip locked in by INITIAL-BUILD P1).

Concretely, by the end:
- Blocks are **draggable** (drag handle to reorder; produces correct `.md`).
- **`/` slash menu** offers block/formatting suggestions (heading, list, todo,
  quote, code, divider, …).
- **`⌘A` is two-level**: inside a block it selects that block; pressed again (or
  when focus isn't in a block) it selects the whole document.
- The header loses the dead **"Pensieve"** label and the inline **theme toggle**.
- Light/dark lives in the **native macOS menu bar** (Appearance), not the app.
- Timeline is no longer a standing right item — it sits under a **⋯ (more) menu**
  (its only item for now; the menu exists so features can be added later).
- A **right meta sidebar** (hidden by default, toggled by an icon next to ⋯) shows
  per-note **category** (Notes & Lessons · In my mind · Execution), **tags**, and
  **relationships** to other notes — all persisted as **YAML frontmatter** in the
  `.md` file.

Out of scope (later updates): audio/video/images, labels auto-generation, search,
AI coach. We only build the metadata *surface + storage*, not AI labeling.

## Decision record (the "outsource as much as possible" directive)
We researched six open-source Notion-style editors (BlockNote, Plate/PlateJS,
Tiptap's Notion template, Editor.js, Yoopta, Novel — full comparison in wiki.md).

**Finding:** no JSON-block editor treats Markdown as lossless. BlockNote (same
ProseMirror/TipTap family, otherwise the best reuse fit) explicitly documents
Markdown as *lossy* and discourages it as source-of-truth. Plate has the best
Markdown round-trip but runs on **Slate** — adopting it means replacing our entire
engine and abandoning the TipTap investment, and it still has round-trip bugs.

**Pivot (owner idea) + P2 spike result:** The "lossy" problem is only lossy vs. a
library's *built-in* converter. If **we own an extended-Markdown standard** (e.g.
`==text==` → highlight) and always serialise→`.md` / parse←`.md`, then `.md` stays
the truth and "lossy" shrinks to "things we chose not to encode." The P2 spike
(`./spike/`, verified headlessly — see wiki.md) **confirms this works**: BlockNote
0.55 round-trips the full v1 block set **idempotently**, and our `==highlight==`
bridge survives losslessly. BlockNote's only change is cosmetic dialect
normalisation (`-`→`*`). So BlockNote is now viable **without** giving up `.md`-truth.

**DECISION (owner-approved 2026-10-04): Path A — BlockNote + our extended-Markdown
standard layer.** `.md` stays the source of truth; BlockNote's drag handle, slash
menu, block selection and formatting toolbar are reused out of the box; our standard
layer (`==highlight==`, future conventions) bridges anything markdown can't natively
express. We **accept BlockNote's canonical dialect** (`*` bullets, heading spacing)
— **no normaliser** — since the round-trip is idempotent and stable. We re-skin
BlockNote to design.md tokens (light/dark). This replaces the current TipTap +
`tiptap-markdown` editor in the main app; the P1 round-trip guarantee is re-
established with new BlockNote-based tests (via `@blocknote/server-util`).

## Definition of done
- Drag-to-reorder, `/` slash menu, and two-level `⌘A` all work in the real app.
- After any block op (reorder / slash-insert / select-delete) the serialized `.md`
  round-trips idempotently through our standard layer — covered by new
  `@blocknote/server-util` tests (replacing the old TipTap `editor.test.ts`).
- A note round-trips through disk **with** its frontmatter (category/tags/links);
  a legacy note with no frontmatter opens with sensible defaults (back-compat).
- Header has no "Pensieve" text and no theme button; theme toggles from the native
  macOS menu and still persists + respects system appearance.
- ⋯ menu holds Timeline; the right meta sidebar toggles from an icon beside it.
- design.md honoured; UX-expert agents consulted on the editor + sidebar + chrome.
- Tests green, typecheck clean, web build + native `.app` build clean, verified by
  running the actual app.

## Roadmap (phases)
Each phase ends with tests + a real-run check, then commit + push.

- [ ] **P1 — Close INITIAL-BUILD & branch.** Merge `update/initial-build` → `main`,
  rename its folder `- OPEN` → `- CLOSED`, prune the branch; cut a fresh
  `update/notion-ux` from `main`. (Owner already approved closing it.)

- [x] **P2 — Research spike: `.md`-truth + block mechanics (decision gate).**
  Verified (headlessly, `./spike/`) that BlockNote 0.55 round-trips our block set
  idempotently and that an owner-defined `==highlight==` standard bridges losslessly
  — so `.md` stays truth. Owner chose **Path A (BlockNote)**, accept canonical
  dialect. (Path-B TipTap probe not needed.)

- [x] **P3 — Swap editor to BlockNote (the heart).** DONE. `src/components/Editor.tsx`
  now hosts BlockNote wired through `src/lib/md/extended.ts` (`.md → blocks` on
  load, `blocks → .md` on change). Drag handle, slash menu, block selection and
  formatting toolbar come with BlockNote; initial skin in `blocknote-skin.css`
  (tokens, light/dark). Old TipTap editor + `tiptap-markdown` + `editor.test.ts`
  removed; deps swapped (BlockNote 0.55 runs on TipTap **v3** — clean reinstall,
  Mantine pinned v8). Tests: `src/lib/md/extended.test.ts` (pure bridge) +
  `extended.server.test.ts` (real round-trip via `@blocknote/server-util`) — 29/29
  green; typecheck + web build clean.
  - **Verified:** logic headless (idempotent `.md` round-trip, nested lists,
    `==highlight==`), AND live render via Puppeteer screenshots (editor, themed
    slash menu, dark skin). Fixed a focus-outline bug found that way.
  - **Done in P7:** two-level `⌘A`, heading typography, Markdown-safe formatting
    toolbar. **Still deferred:** single drag handle / no `+`, trimmed slash menu,
    bundle code-splitting (JS ~1.1 MB / ~330 KB gz) — see issues.txt.

- [x] **P4 — Note metadata model (frontmatter).** `types.ts` gains
  `category`/`tags`/`links` + `CATEGORIES`; `lib/md/frontmatter.ts` (dependency-free)
  parses/composes YAML frontmatter — no metadata → no block (plain notes stay
  plain), missing/unknown → defaults. Tauri store writes frontmatter + body;
  browser store carries the fields. `useNotes.updateMeta` persists edits. Tests:
  frontmatter round-trip + back-compat.

- [x] **P5 — Right meta sidebar + chrome restructure.** "Pensieve" label + inline
  theme button removed; header is a right cluster: ⋯ `OverflowMenu` (Timeline) +
  `PanelRight` Details toggle. Right dock is one slot (Timeline/Details mutually
  exclusive, `Esc` closes). New modular components: `IconButton`, `OverflowMenu`,
  `RightPanel`, `DetailsPanel`, `CategorySelect`, `TagEditor`, `RelationshipList`,
  `icons`. Keyboard `⌘⇧\` for Details. Verified via Puppeteer (menu, panel,
  category/tags; metadata persists). UX synthesised in `ux-notion-chrome.md`.

- [x] **P6 — Native macOS appearance menu (Tauri).** Appearance submenu
  (Light/Dark/System) appended to the default menu; emits `set-theme`, `useTheme`
  listens in the native app. In-app toggle gone; dev-only `⌘⇧L` kept for browser.
  `cargo check` + `tsc` clean. **Runtime (menu click → theme) unverified** — needs
  the native app.

- [~] **P7 — Polish, verify, merge, close.** DONE: two-level `⌘A` (verified),
  heading typography, Markdown-safe formatting toolbar (no colour/underline → `.md`
  stays lossless), focus-outline fix. All 35 tests pass; `tsc` + web build clean;
  live render verified via Puppeteer. REMAINING (owner/next session): run
  `npm run tauri build` + eyeball the **native app** (menu theme, overall feel),
  then merge `update/notion-ux` → `main` and rename this folder `- CLOSED`.
  Smaller deferrals tracked in issues.txt.

## Status
- **Done (P1–P6, P7 code):** all user-requested features built, committed, pushed
  on `update/notion-ux`. Draggable blocks, `/` slash menu, two-level `⌘A`, metadata
  frontmatter + Details sidebar, ⋯ menu, theme in the native menu, no wordmark.
  35/35 tests pass; typecheck + web build clean; `cargo check` clean; web UI
  verified via Puppeteer screenshots.
- **Blocking merge (owner / next session):** the native app itself is unverified
  here — the in-session Chrome extension can't load `localhost`, and a native
  window can't be driven headlessly. Run `npm run tauri dev` (or `tauri build`) and
  confirm: the editor feel, the Appearance menu toggles theme, overall chrome. Then
  merge `update/notion-ux` → `main`, prune, rename folder `- CLOSED`.
- **Resolved decisions:** editor = BlockNote (A); no dialect normaliser; ⋯ menu +
  meta sidebar scope = Timeline + category + tags + relationships (extend later).
