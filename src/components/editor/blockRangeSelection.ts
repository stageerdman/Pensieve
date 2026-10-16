import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

// Select a contiguous run of top-level blocks — from `firstId` to `lastId` in document
// order — as ONE multi-block selection, so Backspace/⌘X removes the whole run and ⌘C
// copies it. Used by the marquee to turn a rubber-band sweep into an actionable selection.
//
// BlockNote's own `setSelection` is the preferred path: it keeps the drag-handle
// group-move working and already spans any blocks sitting between the endpoints. But it
// REFUSES to anchor a selection on a block "without content" — which is exactly our void
// media blocks (audio is `content:"none"`): it throws "selection anchor in block without
// content". So when an endpoint is such a block we fall back to a raw ProseMirror
// TextSelection drawn across the two blocks' container boundaries, which selects — and on
// delete/cut removes — void and text rows alike. Either way the block-selection decoration
// (blockSelectionDecorations) keys off the selection range, so every spanned row lights up.

export interface RangeSelectableEditor {
  prosemirrorView: EditorView | undefined;
  setSelection: (anchor: string, head: string) => void;
}

export function selectBlockRange(editor: RangeSelectableEditor, firstId: string, lastId: string): boolean {
  const view = editor.prosemirrorView;
  if (!view) return false;

  // Fast path: let BlockNote anchor the selection by block id (works when both ends are
  // content blocks, and transparently spans any void blocks between them).
  try {
    editor.setSelection(firstId, lastId);
    return true;
  } catch {
    /* an endpoint is a content-less (void) block — anchor by position below */
  }

  // Fallback: map both endpoint ids to their blockContainer positions and select the span
  // [before(first) … after(last)] directly. The PM blockContainer node carries the block's
  // id in its attrs, so we don't need the DOM here.
  const bounds = new Map<string, { before: number; after: number }>();
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "blockContainer" && node.attrs?.id) {
      bounds.set(node.attrs.id as string, { before: pos, after: pos + node.nodeSize });
    }
    return true;
  });
  const a = bounds.get(firstId);
  const b = bounds.get(lastId);
  if (!a || !b) return false;
  const from = Math.min(a.before, b.before);
  const to = Math.max(a.after, b.after);
  try {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    return true;
  } catch {
    return false;
  }
}
