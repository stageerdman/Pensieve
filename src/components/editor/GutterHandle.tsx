import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { EditorView } from "@tiptap/pm/view";
import { GripVertical } from "../icons";
import { nearestRowId } from "./blockMarquee";
import { selectBlockRange } from "./blockRangeSelection";
import { DRAG_THRESHOLD } from "./dragScroll";
import { GutterMenu, type GutterMenuEditor } from "./GutterMenu";

interface HandleEditor extends GutterMenuEditor {
  prosemirrorView: EditorView | undefined;
  getSelection: () => { blocks: Array<{ id: string }> } | undefined;
  setSelection: (anchor: string, head: string) => void;
}

type StartDrag = (
  e: { clientX: number; clientY: number; button: number; pointerId?: number; currentTarget?: Element },
  ids: string[],
) => void;

interface HandlePos {
  x: number; // gutter x (left of the block content)
  y: number; // top of the block content row
  ids: string[]; // what a drag/menu from here should act on
}

// A block's content row (excludes its nested children) + indent, read from the DOM.
function scanRows(view: EditorView): Array<{ id: string; top: number; bottom: number; left: number }> {
  const out: Array<{ id: string; top: number; bottom: number; left: number }> = [];
  const els = view.dom.querySelectorAll<HTMLElement>('[data-node-type="blockContainer"][data-id]');
  els.forEach((el) => {
    const id = el.getAttribute("data-id");
    // Fall back to the container's own box: a custom block (the image/gallery) may not
    // expose a `> .bn-block-content` child, which would otherwise skip it → no handle.
    const content = el.querySelector<HTMLElement>(":scope > .bn-block-content") ?? el;
    if (!id) return;
    const r = content.getBoundingClientRect();
    out.push({ id, top: r.top, bottom: r.bottom, left: r.left });
  });
  return out;
}

// Our own left-gutter drag handle — replaces BlockNote's SideMenu handle, which (a) uses
// HTML5 drag that can't drop in WKWebView and (b) receives no block via its render prop
// in this version (the block lives in context). We track the hovered block ourselves and
// render a single handle. When the hovered row is part of a multi-row (marquee) selection,
// the handle anchors to the TOP selected row and drags the whole group — one group handle,
// on the uppermost row, exactly as asked.
//
// The handle is dual-action: DRAG it to move the row(s); CLICK it (no drag) to select the
// row(s) and bloom a small menu (Delete / Change type — see GutterMenu). Click vs drag is
// decided by whether the pointer moved past DRAG_THRESHOLD before release.
export function GutterHandle({
  editor,
  wrapRef,
  startDrag,
}: {
  editor: HandleEditor;
  wrapRef: React.RefObject<HTMLElement | null>;
  startDrag: StartDrag;
}) {
  const [pos, setPos] = useState<HandlePos | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const dragging = useRef(false);
  const menuOpen = useRef(false);
  menuOpen.current = !!menu;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const update = (clientX: number, clientY: number) => {
      if (dragging.current || menuOpen.current) return;
      const view = editor.prosemirrorView;
      if (!view) return setPos(null);
      const rows = scanRows(view);
      const hov = rows.find((b) => clientY >= b.top && clientY <= b.bottom);
      // Only while the pointer is near the writing column (ignore the far margins).
      if (!hov || clientX > hov.left + 760) return setPos(null);
      const selIds = editor.getSelection()?.blocks.map((b) => b.id) ?? [];
      const multi = selIds.length >= 2;
      if (multi && selIds.includes(hov.id)) {
        const topId = nearestRowId(rows.filter((r) => selIds.includes(r.id)), -Infinity) ?? selIds[0];
        const top = rows.find((r) => r.id === topId) ?? hov;
        setPos({ x: top.left, y: top.top, ids: selIds });
      } else {
        setPos({ x: hov.left, y: hov.top, ids: [hov.id] });
      }
    };

    const onMove = (e: globalThis.PointerEvent) => update(e.clientX, e.clientY);
    const onLeave = () => {
      if (!dragging.current && !menuOpen.current) setPos(null);
    };
    const onScroll = () => setPos(null); // reappears on the next move at the new position

    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [editor, wrapRef]);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const anchor = { x: pos!.x, y: pos!.y };
    const ids = pos!.ids;
    const startX = e.clientX;
    const startY = e.clientY;
    dragging.current = true;
    let moved = false;
    setPos(null); // hide the handle while interacting; it returns on the next hover
    const onMoveCheck = (ev: globalThis.PointerEvent) => {
      if (Math.abs(ev.clientX - startX) > DRAG_THRESHOLD || Math.abs(ev.clientY - startY) > DRAG_THRESHOLD) moved = true;
    };
    const finish = (opened: boolean) => {
      dragging.current = false;
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("pointermove", onMoveCheck, true);
      // A clean click (no drag) → select the row(s) and open the action menu just below
      // the handle. A drag was already committed by startDrag's own listeners.
      if (opened && !moved) {
        selectBlockRange(editor, ids[0], ids[ids.length - 1]);
        setMenu({ x: anchor.x - 28, y: anchor.y + 22, ids });
      }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("pointermove", onMoveCheck, true);
    startDrag(e, ids);
  };

  return (
    <>
      {pos && (
        <button
          type="button"
          className="pensieve-drag-handle"
          aria-label="Move, or click for actions"
          onPointerDown={onPointerDown}
          style={{ position: "fixed", left: pos.x - 28, top: pos.y, zIndex: 30 }}
        >
          <GripVertical size={16} />
        </button>
      )}
      {menu && (
        <GutterMenu x={menu.x} y={menu.y} ids={menu.ids} editor={editor} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
