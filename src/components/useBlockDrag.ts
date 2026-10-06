import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { EditorView } from "@tiptap/pm/view";
import { log } from "../lib/logger";
import { computeDrop, NEST_INDENT, type DropBlock, type DropTarget } from "./blockDrag";

// A block as BlockNote hands it back — we only touch id + children (recursively) here.
interface Block {
  id: string;
  children?: Block[];
  [k: string]: unknown;
}

interface DragEditor {
  prosemirrorView: EditorView | undefined;
  getBlock: (id: string) => Block | undefined;
  insertBlocks: (blocks: unknown[], reference: string, placement: "before" | "after") => Block[];
  removeBlocks: (ids: string[]) => void;
  setSelection: (anchor: string, head: string) => void;
  setTextCursorPosition: (id: string, placement?: "start" | "end") => void;
  nestBlock: () => void;
}

const DRAG_THRESHOLD = 5;
const EDGE = 56;
const MAX_SPEED = 18;

// Drop a block's `id`s (recursively) so re-inserted copies get fresh ids — avoids any
// duplicate-id window between insert and the removal of the originals.
function stripIds(b: Block): Record<string, unknown> {
  const { id: _id, children, ...rest } = b;
  void _id;
  return { ...rest, children: Array.isArray(children) ? children.map(stripIds) : [] };
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let e = el?.parentElement ?? null;
  while (e) {
    const oy = getComputedStyle(e).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && e.scrollHeight > e.clientHeight) return e;
    e = e.parentElement;
  }
  return null;
}

interface DragState {
  ids: string[]; // the blocks being moved
  moving: Set<string>; // ids + all their descendants (can't drop into own subtree)
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  active: boolean;
  target: DropTarget | null;
  scroller: HTMLElement | null;
  raf: number;
}

// Pointer-based block drag — the move engine BlockNote's HTML5 drag can't be in this
// webview. Returns `startDrag(event, ids)` for a drag handle to call on pointer-down. It
// shows a drop indicator while dragging and commits the move with BlockNote's block API
// (insert copies at the target, remove the originals), so it's reliable in WKWebView.
export function useBlockDrag(editor: DragEditor, wrapRef: RefObject<HTMLElement | null>) {
  const state = useRef<DragState | null>(null);
  const indicator = useRef<HTMLDivElement | null>(null);
  const handlersRef = useRef<{ onMove: (e: PointerEvent) => void; onUp: () => void } | null>(null);

  // Every block (any depth) with the geometry the drop logic needs: the content row's
  // box (not counting its children) and its left indent. Also returns a DOM map so the
  // caller can place the indicator against the reference block.
  const scanBlocks = useCallback((): { blocks: DropBlock[]; rects: Map<string, DOMRect> } => {
    const view = editor.prosemirrorView;
    const rects = new Map<string, DOMRect>();
    if (!view) return { blocks: [], rects };
    const els = Array.from(view.dom.querySelectorAll<HTMLElement>('[data-node-type="blockContainer"][data-id]'));
    const blocks: DropBlock[] = [];
    for (const el of els) {
      const id = el.getAttribute("data-id");
      const content = el.querySelector<HTMLElement>(":scope > .bn-block-content");
      if (!id || !content) continue;
      const r = content.getBoundingClientRect();
      rects.set(id, r);
      blocks.push({ id, top: r.top, bottom: r.bottom, left: r.left, canNest: true });
    }
    return { blocks, rects };
  }, [editor]);

  const descendantsOf = useCallback(
    (ids: string[]): Set<string> => {
      const view = editor.prosemirrorView;
      const set = new Set(ids);
      if (!view) return set;
      for (const id of ids) {
        const host = view.dom.querySelector(`[data-node-type="blockContainer"][data-id="${id}"]`);
        host?.querySelectorAll<HTMLElement>('[data-node-type="blockContainer"][data-id]').forEach((d) => {
          const did = d.getAttribute("data-id");
          if (did) set.add(did);
        });
      }
      return set;
    },
    [editor],
  );

  const clearIndicator = () => {
    indicator.current?.remove();
    indicator.current = null;
  };

  const drawIndicator = (target: DropTarget | null, rects: Map<string, DOMRect>) => {
    if (!target) {
      clearIndicator();
      return;
    }
    const r = rects.get(target.referenceId);
    if (!r) return;
    if (!indicator.current) {
      indicator.current = document.createElement("div");
      indicator.current.className = "pensieve-drop-indicator";
      document.body.appendChild(indicator.current);
    }
    const left = target.nest ? r.left + NEST_INDENT : r.left;
    const y = target.placement === "before" ? r.top : r.bottom;
    const el = indicator.current;
    el.style.left = `${left}px`;
    el.style.top = `${y - 1}px`;
    el.style.width = `${Math.max(40, r.right - left)}px`;
    el.classList.toggle("is-nest", target.nest);
  };

  const recompute = useCallback(() => {
    const s = state.current;
    if (!s) return;
    const { blocks, rects } = scanBlocks();
    s.target = computeDrop(blocks, s.lastX, s.lastY, s.moving);
    drawIndicator(s.target, rects);
  }, [scanBlocks]);

  const autoScroll = useCallback(() => {
    const s = state.current;
    if (!s?.active) return;
    s.raf = 0;
    const top = s.scroller ? s.scroller.getBoundingClientRect().top : 0;
    const bottom = s.scroller ? s.scroller.getBoundingClientRect().bottom : window.innerHeight;
    let dy = 0;
    if (s.lastY < top + EDGE) dy = -MAX_SPEED * Math.min(1, (top + EDGE - s.lastY) / EDGE);
    else if (s.lastY > bottom - EDGE) dy = MAX_SPEED * Math.min(1, (s.lastY - (bottom - EDGE)) / EDGE);
    if (dy !== 0) {
      if (s.scroller) s.scroller.scrollBy(0, dy);
      else window.scrollBy(0, dy);
      recompute();
      s.raf = requestAnimationFrame(autoScroll);
    }
  }, [recompute]);

  const commit = useCallback(
    (ids: string[], target: DropTarget) => {
      try {
        const moving = ids.map((id) => editor.getBlock(id)).filter((b): b is Block => !!b);
        if (moving.length === 0) return;
        const copies = moving.map(stripIds);
        let inserted: Block[];
        if (target.nest) {
          const ref = editor.getBlock(target.referenceId);
          if (ref?.children && ref.children.length > 0) {
            // Nest as the first children of a block that already has a child group.
            inserted = editor.insertBlocks(copies, ref.children[0].id, "before");
          } else {
            // No child group yet: drop as the next sibling(s), then nest under the block.
            inserted = editor.insertBlocks(copies, target.referenceId, "after");
            if (inserted.length === 1) editor.setTextCursorPosition(inserted[0].id, "start");
            else if (inserted.length > 1) editor.setSelection(inserted[0].id, inserted[inserted.length - 1].id);
            editor.nestBlock();
          }
        } else {
          inserted = editor.insertBlocks(copies, target.referenceId, target.placement);
        }
        // Park the cursor on a freshly-inserted block so removing the originals never
        // deletes the block the selection is sitting in.
        if (inserted.length > 0) editor.setTextCursorPosition(inserted[0].id, "start");
        editor.removeBlocks(ids);
        log.debug("editor", "blockdrag.commit", { count: ids.length, nest: target.nest, placement: target.placement });
      } catch (err) {
        log.warn("editor", "blockdrag.commit.fail", { err: String(err) });
      }
    },
    [editor],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = state.current;
      if (!s) return;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      if (!s.active) {
        if (Math.abs(e.clientX - s.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - s.startY) < DRAG_THRESHOLD) return;
        s.active = true;
        s.scroller = findScrollParent(wrapRef.current);
        wrapRef.current?.classList.add("pensieve-block-dragging");
        log.debug("editor", "blockdrag.start", { count: s.ids.length });
      }
      e.preventDefault();
      recompute();
      if (!s.raf) s.raf = requestAnimationFrame(autoScroll);
    };
    const onUp = () => {
      const s = state.current;
      if (!s) return;
      if (s.raf) cancelAnimationFrame(s.raf);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      wrapRef.current?.classList.remove("pensieve-block-dragging");
      clearIndicator();
      if (s.active && s.target) commit(s.ids, s.target);
      state.current = null;
    };
    // The handle calls this; we stash it so startDrag (below) can wire window listeners.
    handlersRef.current = { onMove, onUp };
    return () => {
      const s = state.current;
      if (s?.raf) cancelAnimationFrame(s.raf);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      clearIndicator();
      state.current = null;
    };
  }, [recompute, autoScroll, commit, wrapRef]);

  const startDrag = useCallback(
    (e: { clientX: number; clientY: number; button: number; pointerId?: number; currentTarget?: Element }, ids: string[]) => {
      if (e.button !== 0 || ids.length === 0) return;
      const h = handlersRef.current;
      if (!h) return;
      state.current = {
        ids,
        moving: descendantsOf(ids),
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        active: false,
        target: null,
        scroller: null,
        raf: 0,
      };
      try {
        if (e.pointerId != null) (e.currentTarget as Element & { setPointerCapture?: (id: number) => void })?.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture unavailable — drag still works */
      }
      window.addEventListener("pointermove", h.onMove, true);
      window.addEventListener("pointerup", h.onUp, true);
      window.addEventListener("pointercancel", h.onUp, true);
    },
    [descendantsOf],
  );

  return startDrag;
}
