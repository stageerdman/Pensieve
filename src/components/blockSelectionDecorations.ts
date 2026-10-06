import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// A TipTap/ProseMirror extension that paints a crisp, full-width block highlight on
// every top-level row a selection spans — but only once the selection covers 2+ rows.
//
// Why this exists: BlockNote draws single-block (node) selections itself, but a
// multi-block selection relies on the browser's native text highlight, which vanishes
// the instant focus leaves the editor — e.g. the moment you grab the drag handle. That
// made a multi-row selection look like it had been lost right as you tried to move it.
// A ProseMirror node decoration is part of editor state, so it survives focus changes
// and renders as a solid block highlight (Notion-style), not a text-run highlight.
//
// It keys off the selection itself (single source of truth), so it also upgrades a plain
// text drag across blocks and whole-doc ⌘A to the same clean block look.

const key = new PluginKey("pensieveBlockSelection");

function multiBlockDecorations(state: EditorState): DecorationSet {
  const { from, to, empty } = state.selection;
  if (empty) return DecorationSet.empty;

  const ranges: Array<{ from: number; to: number }> = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "blockContainer") return true;
    // Top-level rows only: the position before a root block sits directly inside the
    // root blockGroup (depth 1). Nested blocks live deeper — skip descending into them
    // so a parent and its children aren't both highlighted.
    if (state.doc.resolve(pos).depth !== 1) return false;
    const end = pos + node.nodeSize;
    if (pos < to && end > from) ranges.push({ from: pos, to: end });
    return false;
  });

  // One row touched is an ordinary caret/text selection — leave it alone.
  if (ranges.length < 2) return DecorationSet.empty;
  return DecorationSet.create(
    state.doc,
    ranges.map((r) => Decoration.node(r.from, r.to, { class: "pensieve-block-selected" })),
  );
}

export const BlockSelectionDecorations = Extension.create({
  name: "pensieveBlockSelection",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          decorations: (state) => multiBlockDecorations(state),
        },
      }),
    ];
  },
});
