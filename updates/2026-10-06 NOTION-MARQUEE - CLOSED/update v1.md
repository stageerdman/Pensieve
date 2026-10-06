# Update v1 — NOTION-MARQUEE (click blank space, drag-select & move multiple rows)

Status: **CLOSED — owner-verified 2026-10-06 ("works just perfectly").** Marquee multi-row
selection + a pointer-based block drag (own gutter handle, drop indicator, nesting), all
WKWebView-safe. Merged to `main`; branch `update/notion-marquee` pruned.

Path to done (v1 → v3):
- v1: marquee select + rely on BlockNote's handle drag.
- v2: BlockNote's drag is HTML5 (dead in WKWebView) → rewrote as a pointer drag; fixed
  marquee scroll-deselect (anchor to the starting row) + edge auto-scroll.
- v3: BlockNote's SideMenu render prop passes empty props in v0.55 (block is in context),
  so the handle couldn't grab and showed on every row → replaced it with our own
  `GutterHandle`. Owner-verified.

## v2 fixes (owner feedback 2026-10-06)
- **Couldn't drop anywhere / no drop lines** → BlockNote's drag is HTML5 (dead in
  WKWebView). Replaced with a pointer-based drag (`useBlockDrag`) + our own drop
  indicator; commit via BlockNote's block API. Reorder + nest-under-a-block supported.
- **Scrolling deselected rows above** → the marquee anchored to a viewport Y. Now anchored
  to the starting **row** (by id); added edge auto-scroll so you can select past the
  viewport.
- **Multiple handles** → one pointer-driven group handle, pinned to the TOP selected row.


## Goal
Add the one Notion editor interaction that was missing: when the mouse is **outside the
rows** (the blank margin), **click-drag to rubber-band-select multiple rows**, then
**drag the whole set** somewhere else (e.g. to nest them under a bullet). Make it feel as
flawless as Notion.

## What we found (so the fix stayed small)
The editor is **BlockNote** (wrapping ProseMirror/TipTap v3), not raw TipTap.
- BlockNote's drag handle **already moves all blocks of a multi-block selection together**
  (its drag code detects when the grabbed block sits inside a multi-block selection and
  builds a `MultipleNodeSelection`).
- BlockNote exposes `editor.setSelection(firstBlockId, lastBlockId)` → a cross-block
  selection that the drag handle treats as multi-block.
- There was **no marquee / gutter-drag / multi-block highlight** anywhere.

So the only missing piece was the **marquee that creates the selection**. Dragging it was
already solved — we just drive BlockNote's own machinery.

## Locked decisions (owner, 2026-10-06)
- **Handle-only drag** (not direct-drag-from-selection). After a marquee, grab the drag
  handle and all selected rows move together.
- **Single group handle on the TOP selected row.** When several rows are selected, the
  gutter shows one handle (on the uppermost row), not one per hovered row.

## Roadmap / phases
1. **Pure helpers** (`blockMarquee.ts`) — row-wise band intersection + "is this a blank
   place to start a marquee?" targeting. Unit-tested. ✅
2. **Block-selection highlight** (`blockSelectionDecorations.ts`) — a ProseMirror node
   decoration that paints a full-width accent wash on every row a 2+-block selection
   spans. Survives focus leaving the editor (native text highlight didn't), so the
   selection stays visible as you reach for the handle. Injected via BlockNote's
   `_tiptapOptions`. ✅
3. **Marquee + group handle** (`useBlockMarquee.ts`, `EditorSideMenu.tsx`) — pointer-drag
   in the blank margin draws the band, picks rows by vertical overlap, sets the selection
   via `editor.setSelection`; the side menu collapses to a single top-row handle. ✅
4. **Verify** — tsc, 240 tests green, web build. Native build + owner test. ⏳

## Status / live notes
- Done: phases 1–3, web build + full test suite green (240 tests incl. 15 new).
- Next: native `tauri:build`, owner verifies the real drag feel; then merge to `main`.
- Deferred (note for a v2 if wanted): **auto-scroll** while marqueeing past the top/bottom
  edge (Notion scrolls to let you select beyond the viewport); **direct-drag** by grabbing
  the highlighted selection body (owner chose handle-only for v1).

## Files
- `src/components/blockMarquee.ts` (+ `.test.ts`) — pure geometry/targeting.
- `src/components/blockSelectionDecorations.ts` — multi-row highlight (PM node decoration).
- `src/components/useBlockMarquee.ts` (+ `.test.tsx`) — the marquee pointer interaction.
- `src/components/EditorSideMenu.tsx` — selection-aware single top-row drag handle.
- `src/components/Editor.tsx` — wires the extension, the hook, and the side menu.
- `src/components/blocknote-skin.css` — highlight wash, rubber-band rectangle, marquee
  user-select guard.
