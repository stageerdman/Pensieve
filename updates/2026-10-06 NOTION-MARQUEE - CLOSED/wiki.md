# NOTION-MARQUEE — durable decisions & lessons

## The editor is BlockNote, not raw TipTap
`src/components/Editor.tsx` uses `useCreateBlockNote` (`@blocknote/*` v0.55). Reach
ProseMirror via `editor.prosemirrorView`. Inject raw TipTap/PM extensions with
`useCreateBlockNote({ _tiptapOptions: { extensions: [...] } })` — the supported escape
hatch (core merges them into its tiptap extension list).

## BlockNote's drag is HTML5 drag-and-drop → it does NOT work in the WKWebView shell
**Owner-confirmed (2026-10-06):** in the native app you can pick up a block with
BlockNote's handle, but no drop line ever appears and releasing snaps it back. BlockNote's
`SideMenu/dragging.ts` uses `dragstart`/`dataTransfer`/`setDragImage` + a `dropcursor`
plugin — exactly the HTML5 DnD that WKWebView fires unreliably (same reason the gallery
rolls its own pointer-drag). So we **do not use BlockNote's drag at all**. We render our
own pointer-driven handle and move blocks ourselves:
- `useBlockDrag.ts` — pointer drag + a drop indicator; commit via the block API below.
- Commit = `insertBlocks(copies, reference, before/after)` then `removeBlocks(originalIds)`.
  Nest under a block = insert before its first child if it has one, else insert as the
  next sibling(s) and `nestBlock()`. Copies have their ids stripped so there's no
  duplicate-id window. Cursor is parked on an inserted block before the remove.
- `blockDrag.ts` — pure `computeDrop(blocks, x, y, moving)`: reckons only against
  stationary blocks (can't drop into the moving subtree); Y picks the gap, X past
  `NEST_INDENT` nests.

Historical note (why the first cut failed): BlockNote's handle drag *does* expand a
multi-block selection to a `MultipleNodeSelection` and move the whole range — but only if
the HTML5 drop lands, which it never does here. The selection plumbing was right; the
transport was dead.

- `editor.setSelection(firstBlockId, lastBlockId)` makes a cross-block **TextSelection**
  from inside the first block's content to inside the last — exactly what the drag path
  recognises as multi-block. It **throws** if the two ids are equal or if an endpoint is a
  no-content block (image/divider). We `try/catch` and trim the range inward on failure.
- `editor.getSelection()` returns `{ blocks }` for a cross-block selection, and
  `undefined` for a NodeSelection — used by `EditorSideMenu` to find the top selected row.

## Block DOM shape (verified from the 0.55 bundle)
The `blockContainer` nodeView renders:
- `dom` = `.bn-block-outer` — `data-node-type="blockOuter"`, carries `data-id`.
- `contentDOM` = `.bn-block` — `data-node-type="blockContainer"`, carries `data-id`.

Consequences:
- To enumerate rows, query `[data-node-type="blockContainer"][data-id]` (the inner
  `.bn-block`). Top-level = `!el.parentElement.closest('[data-node-type="blockContainer"]')`.
- A **ProseMirror node decoration's class lands on `dom` = `.bn-block-outer`**, not on the
  `[data-node-type="blockContainer"]` element. The highlight CSS therefore targets
  `.bn-block-outer.pensieve-block-selected > .bn-block` (with a direct-on-`.bn-block`
  safety net).

## Why a decoration for the highlight (not native selection)
A multi-block **text** selection is drawn by the browser's native highlight, which
disappears the moment focus leaves the editor — e.g. when you grab the drag handle. That
made the selection look lost right as you went to move it. A PM **node decoration** is
part of editor state, so it persists across focus changes and renders as a solid
full-width block wash (the Notion look). Keyed off the selection itself, so cross-block
text drags and whole-doc ⌘A get the same clean highlight for free.

## Marquee = pointer events, not HTML5 DnD
Same reason as the gallery strip: WKWebView fires HTML5 drop unreliably. The marquee uses
`pointerdown/move/up`, a 5px drag threshold, and only starts in **blank** space
(`isBlankMarqueeTarget`: not on `.bn-inline-content` text, not the `.bn-side-menu` handle,
not a control/file block). Dragging over real text stays a normal text selection — that's
the gate that makes both gestures coexist, exactly like Notion. Row pick is **vertical
overlap** (X ignored): a margin drag is a vertical gesture.

## Open ideas (not built)
- Auto-scroll while dragging past the viewport edge (select beyond what's visible).
- Direct-drag by grabbing the highlighted selection body (owner chose handle-only v1).
