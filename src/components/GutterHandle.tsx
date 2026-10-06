import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { EditorView } from "@tiptap/pm/view";
import { GripVertical } from "./icons";
import { nearestRowId } from "./blockMarquee";

interface HandleEditor {
  prosemirrorView: EditorView | undefined;
  getSelection: () => { blocks: Array<{ id: string }> } | undefined;
}

type StartDrag = (
  e: { clientX: number; clientY: number; button: number; pointerId?: number; currentTarget?: Element },
  ids: string[],
) => void;

interface HandlePos {
  x: number; // gutter x (left of the block content)
  y: number; // top of the block content row
  ids: string[]; // what a drag from here should move
}

// A block's content row (excludes its nested children) + indent, read from the DOM.
function scanRows(view: EditorView): Array<{ id: string; top: number; bottom: number; left: number }> {
  const out: Array<{ id: string; top: number; bottom: number; left: number }> = [];
  const els = view.dom.querySelectorAll<HTMLElement>('[data-node-type="blockContainer"][data-id]');
  els.forEach((el) => {
    const id = el.getAttribute("data-id");
    const content = el.querySelector<HTMLElement>(":scope > .bn-block-content");
    if (!id || !content) return;
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
  const dragging = useRef(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const update = (clientX: number, clientY: number) => {
      if (dragging.current) return;
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
      if (!dragging.current) setPos(null);
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

  if (!pos) return null;

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    setPos(null); // hide the handle while dragging; it returns on the next hover
    const done = () => {
      dragging.current = false;
      window.removeEventListener("pointerup", done, true);
      window.removeEventListener("pointercancel", done, true);
    };
    window.addEventListener("pointerup", done, true);
    window.addEventListener("pointercancel", done, true);
    startDrag(e, pos.ids);
  };

  return (
    <button
      type="button"
      className="pensieve-drag-handle"
      aria-label="Drag to move"
      onPointerDown={onPointerDown}
      style={{ position: "fixed", left: pos.x - 28, top: pos.y, zIndex: 30 }}
    >
      <GripVertical size={16} />
    </button>
  );
}
