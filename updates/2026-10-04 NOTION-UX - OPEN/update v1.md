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
  - **Verified:** logic end-to-end headless (idempotent `.md` round-trip, nested
    lists, `==highlight==` preserved), typecheck, web build.
  - **NOT yet verified:** live visual render / drag / slash in a browser — the
    in-session Chrome extension can't load `localhost` here (server healthy on
    curl). Needs an eyeball at http://localhost:5173 (owner, or next session).
  - **Deferred to P7:** full skin polish per `ux-notion-chrome.md` (single drag
    handle / no `+`, trimmed slash menu, remove bubble colour pickers), two-level
    `⌘A`, and bundle code-splitting (current JS 1.08 MB / 329 KB gz).

- [ ] **P4 — Note metadata model (frontmatter).** Extend `Note`/types with
  `category`, `tags[]`, `relationships[]`; parse/serialize **YAML frontmatter** in
  both store adapters (browser + tauri) with the markdown body untouched as truth.
  Default category = "Notes & Lessons"; missing frontmatter → defaults (back-compat).
  Tests: frontmatter round-trip; legacy plain-`.md` still loads.

- [ ] **P5 — Right meta sidebar + chrome restructure.** Remove the "Pensieve" label
  and inline theme button. Add a **⋯ menu** (Timeline inside it) and a
  **right-sidebar toggle** icon beside it. Build the right sidebar (hidden by
  default): category picker, tag editor, relationships list/linker. Timeline opens
  from the ⋯ menu. UX agents review editor + sidebar + chrome in parallel.

- [ ] **P6 — Native macOS appearance menu (Tauri).** Add a native menu item
  (Appearance: Light / Dark / System) that drives the webview theme via a Tauri
  event; remove the in-app toggle; persist + follow system appearance by default.
  Rust menu builds; event round-trips to `useTheme`.

- [ ] **P7 — Polish, verify, merge, close.** design.md pass, a11y + keyboard check,
  full test + typecheck + web build + `npm run tauri build`, real-run
  verification. Merge `update/notion-ux` → `main`, rename this folder to `- CLOSED`.

## Status
- **Done:** desk research (6 editors); P2 spike proving `.md`-truth works with
  BlockNote and the owner's custom-standard idea (verified). Editor path decided:
  **A — BlockNote**, accept canonical dialect.
- **Next:** auto-build P1 → P7 per build mode (commit + push + verify each phase).
- **Resolved decisions:** editor = BlockNote (A); no dialect normaliser; ⋯ menu +
  meta sidebar scope = Timeline + category + tags + relationships (extend later).
