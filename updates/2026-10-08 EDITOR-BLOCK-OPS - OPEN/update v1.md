# EDITOR-BLOCK-OPS

## Goal
Multi-block selection in the editor should behave like a selection: you can **delete**
the selected blocks and **copy / cut / paste** them somewhere else. Today you can
marquee-select rows (and drag them with the gutter handle), but Delete and ⌘C/⌘X/⌘V
do nothing.

## Diagnosis
The Notion-style marquee (`useBlockMarquee.ts`) sets a ProseMirror selection via
BlockNote's `editor.setSelection(anchor, head)` (a cross-block `TextSelection`) and a
single-row `NodeSelection` for one block — but it **never focuses the editor's
contentEditable**. The press starts in the blank margin, so focus never lands in the
editor on its own.

Consequence: the browser delivers no `keydown` (Backspace/Delete) and no
`copy`/`cut`/`paste` events to ProseMirror, so BlockNote's built-in delete and clipboard
handling never fire. The selection is only *painted* (by `blockSelectionDecorations.ts`,
which survives focus loss by design) — it isn't *actionable*.

The gutter drag-handle path (`GutterHandle` / `useBlockDrag`) is pointer-driven, which is
why **moving** a selection works but keyboard ops don't.

## Fix
When the marquee finalizes a selection (pointer-up after a real drag), focus the
ProseMirror view. `view.focus()` re-syncs the DOM selection to the stored PM selection,
so native Delete and Copy/Cut/Paste now operate on the selected blocks. This covers both
the multi-row `TextSelection` and the single-row `NodeSelection`.

## Roadmap
- [ ] Phase 1 — Focus the view on marquee end; unit test it. Typecheck + tests green.
- [ ] Phase 2 — Build the native app; owner verifies Delete and Copy/Paste on a
      multi-block selection. Merge to main, close out.

## Status
- Started 2026-10-08. Diagnosis confirmed by code read (no `.focus()` anywhere in the
  marquee/drag path).
