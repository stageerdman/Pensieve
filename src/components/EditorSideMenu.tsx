import { SideMenu, DragHandleButton } from "@blocknote/react";
import type { ComponentProps } from "react";

type MenuProps = ComponentProps<typeof SideMenu>;

// Minimal view of the editor: we only read the current block selection to decide where
// the handle belongs.
interface SelectionReader {
  getSelection: () => { blocks: Array<{ id: string }> } | undefined;
}

// The left-gutter side menu, reduced to the drag handle — but selection-aware: when
// several rows are selected (via the marquee), BlockNote would otherwise offer a handle
// on whichever row you hover. Notion shows a single group handle at the top of the
// selection, so we render the handle only on the topmost selected row and suppress it on
// the others. Grabbing it still moves the whole selection (BlockNote's drag expands to
// the full selection when the grabbed block is inside it).
export function EditorSideMenu({ menuProps, editor }: { menuProps: MenuProps; editor: SelectionReader }) {
  const hovered = (menuProps as { block?: { id?: string } }).block?.id;
  const ids = editor.getSelection()?.blocks.map((b) => b.id) ?? [];
  const multi = ids.length >= 2;
  // Show the handle normally for any non-multi state or a row outside the selection;
  // within a multi-row selection, only the top row carries it.
  const showHandle = !multi || !hovered || !ids.includes(hovered) || hovered === ids[0];
  return <SideMenu {...menuProps}>{showHandle ? <DragHandleButton {...menuProps} /> : <></>}</SideMenu>;
}
