import { TextSelection, type Transaction } from "@tiptap/pm/state";

// Enter inside a callout's own line keeps you INSIDE the box.
//
// A callout block's inline content is its first line; the rest of its body are its
// children (lib/md/extended). BlockNote's default Enter splits the block container, which
// would put the new line — and every child with it — AFTER the callout, i.e. outside the
// box. Instead: the text after the caret moves into a new paragraph that becomes the
// callout's FIRST child, and the caret follows it. Leaving the box is BlockNote's own
// gesture: Enter on an empty child line un-nests it.
//
// Pure ProseMirror (no DOM) so it's testable against a real editor's transaction.

/** Apply the callout Enter to `tr`; returns false (tr untouched) when the caret isn't in a
 *  callout's own line. */
export function enterInCallout(tr: Transaction): boolean {
  const { $from, $to } = tr.selection;
  if ($from.parent.type.name !== "callout" || !$from.sameParent($to)) return false;
  if (!tr.selection.empty) tr.deleteSelection();

  const $pos = tr.selection.$from;
  const d = $pos.depth; // the callout content node
  const container = $pos.node(d - 1); // its blockContainer
  const schema = tr.doc.type.schema;
  const tail = $pos.parent.content.cut($pos.parentOffset);
  const child = schema.nodes.blockContainer.create(null, schema.nodes.paragraph.create(null, tail));
  const hasChildren = container.childCount > 1;

  // Cut the tail off the callout's line first, then insert the new first child just after
  // the (now shorter) line — inside the existing children group, or in a new one.
  const tailStart = $pos.pos;
  const tailEnd = $pos.end(d);
  const contentEnd = $pos.after(d) - (tailEnd - tailStart);
  if (tailEnd > tailStart) tr.delete(tailStart, tailEnd);
  let caret: number;
  if (hasChildren) {
    tr.insert(contentEnd + 1, child); // +1 = inside the blockGroup
    caret = contentEnd + 1 + 2; // into blockContainer → paragraph
  } else {
    tr.insert(contentEnd, schema.nodes.blockGroup.create(null, child));
    caret = contentEnd + 3; // into blockGroup → blockContainer → paragraph
  }
  tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView();
  return true;
}
