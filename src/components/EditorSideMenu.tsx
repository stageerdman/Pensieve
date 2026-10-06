import { SideMenu } from "@blocknote/react";
import type { ComponentProps, PointerEvent } from "react";
import { GripVertical } from "./icons";

type MenuProps = ComponentProps<typeof SideMenu>;

interface SelectionReader {
  getSelection: () => { blocks: Array<{ id: string }> } | undefined;
}

type StartDrag = (
  e: { clientX: number; clientY: number; button: number; pointerId?: number; currentTarget?: Element },
  ids: string[],
) => void;

// The left-gutter drag handle — our own, pointer-driven (BlockNote's built-in handle uses
// HTML5 drag, which can't drop in the WKWebView shell). BlockNote's SideMenu still
// positions it against the hovered block.
//
// Selection-aware so a multi-row (marquee) selection shows a single group handle on the
// TOP selected row — not one per hovered row. Grabbing it drags the whole selection;
// grabbing an unselected row's handle drags just that row.
export function EditorSideMenu({
  menuProps,
  editor,
  startDrag,
}: {
  menuProps: MenuProps;
  editor: SelectionReader;
  startDrag: StartDrag;
}) {
  const hovered = (menuProps as { block?: { id?: string } }).block?.id;
  const ids = editor.getSelection()?.blocks.map((b) => b.id) ?? [];
  const multi = ids.length >= 2;

  // Within a multi-row selection, suppress the handle on every selected row except the
  // top one → a single group handle.
  if (multi && hovered && ids.includes(hovered) && hovered !== ids[0]) return null;

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const dragIds = multi && hovered && ids.includes(hovered) ? ids : hovered ? [hovered] : [];
    startDrag(e, dragIds);
  };

  return (
    <SideMenu {...menuProps}>
      <button type="button" className="pensieve-drag-handle" aria-label="Drag to move" onPointerDown={onPointerDown}>
        <GripVertical size={16} />
      </button>
    </SideMenu>
  );
}
