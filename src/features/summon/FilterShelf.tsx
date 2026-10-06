import { useRef, useState } from "react";
import type { Filter, FilterNode, Relation } from "../../lib/search/types";
import { isGroup } from "../../lib/search/types";
import { canGroup, findNode } from "../../lib/search/tree";
import { Sparkles } from "../../components/icons";
import { Node, type GroupHandlers } from "./FilterGroupView";

// The stacked-filter shelf under the summon bar. Top-level chips/groups are AND-combined
// (no connector words). Shift-click 2+ chips → one combine control offers AND/OR, fusing
// them into a group. Drag a chip (pointer-based, WKWebView-safe) onto a group to drop it
// in, or onto the top-level strip to pull it out. ✨ clears everything.

interface Props {
  items: FilterNode[];
  ctx: { tags: string[]; categories: string[]; now: number };
  onReplace: (id: string, filter: Filter) => void;
  onPop: (id: string) => void;
  onFuse: (ids: string[], relation: Relation) => void;
  onRelate: (groupId: string, relation: Relation) => void;
  onMove: (leafId: string, target: string | null, index: number) => void;
  onClearAll: () => void;
}

interface DragState {
  id: string;
  label: string;
  x: number;
  y: number;
}

export function FilterShelf({ items, ctx, onReplace, onPop, onFuse, onRelate, onMove, onClearAll }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropId, setDropId] = useState<string | null | undefined>(undefined);

  // Latest values for the window pointer handlers (avoid stale closures).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const pending = useRef<{ id: string; label: string; sx: number; sy: number } | null>(null);
  const movedRef = useRef(false);
  const didDragRef = useRef(false);
  const moveHandler = useRef<(e: PointerEvent) => void>();
  const upHandler = useRef<(e: PointerEvent) => void>();

  if (items.length === 0) return null;

  const hitTest = (x: number, y: number): string | null | undefined => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return undefined;
    const g = el.closest("[data-drop-group]") as HTMLElement | null;
    if (g) return g.dataset.dropGroup!;
    if (el.closest("[data-drop-top]")) return null;
    return undefined;
  };

  const endListeners = () => {
    if (moveHandler.current) window.removeEventListener("pointermove", moveHandler.current);
    if (upHandler.current) window.removeEventListener("pointerup", upHandler.current);
  };

  const onChipPointerDown = (id: string, label: string, e: React.PointerEvent) => {
    if (e.button !== 0 || e.shiftKey) return; // left-drag only; shift is for selecting
    pending.current = { id, label, sx: e.clientX, sy: e.clientY };
    movedRef.current = false;

    moveHandler.current = (ev: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!movedRef.current) {
        if (Math.hypot(ev.clientX - p.sx, ev.clientY - p.sy) < 5) return;
        movedRef.current = true;
      }
      setDrag({ id: p.id, label: p.label, x: ev.clientX, y: ev.clientY });
      setDropId(hitTest(ev.clientX, ev.clientY));
    };
    upHandler.current = (ev: PointerEvent) => {
      endListeners();
      const p = pending.current;
      pending.current = null;
      if (movedRef.current && p) {
        const target = hitTest(ev.clientX, ev.clientY);
        if (target !== undefined) {
          const g = target === null ? null : findNode(itemsRef.current, target);
          const index =
            target === null ? itemsRef.current.length : g && isGroup(g) ? g.children.length : 0;
          onMoveRef.current(p.id, target, index);
        }
        didDragRef.current = true; // suppress the click that follows a drag
        window.setTimeout(() => (didDragRef.current = false), 0);
      }
      movedRef.current = false;
      setDrag(null);
      setDropId(undefined);
    };
    window.addEventListener("pointermove", moveHandler.current);
    window.addEventListener("pointerup", upHandler.current);
  };

  const onChipClick = (id: string, shift: boolean) => {
    if (didDragRef.current) return; // it was a drag, not a click
    if (shift) toggleSelect(id);
    else setEditingId((cur) => (cur === id ? null : id));
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearSelection = () => setSelected(new Set());
  const selectedIds = [...selected];
  const fusible = canGroup(items, selectedIds);

  const fuse = (relation: Relation) => {
    if (!fusible) return;
    onFuse(selectedIds, relation);
    clearSelection();
  };

  const pop = (id: string) => {
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (editingId === id) setEditingId(null);
    onPop(id);
  };

  const h: GroupHandlers = {
    selected,
    editingId,
    dragging: drag?.id ?? null,
    dropId,
    ctx,
    onChipClick,
    onChipPointerDown,
    onEditClose: () => setEditingId(null),
    onReplace,
    onPop: pop,
    onRelate,
  };

  return (
    <div className="mt-3">
      <div
        data-drop-top
        className={
          "flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-xl p-1 " +
          (dropId === null ? "summon-drop-active" : "")
        }
      >
        {items.map((node) => (
          <Node key={node.id} node={node} h={h} />
        ))}

        <button
          type="button"
          onClick={onClearAll}
          title="Clear all filters"
          aria-label="Clear all filters"
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:text-accent"
        >
          <Sparkles size={16} />
        </button>
      </div>

      {selectedIds.length >= 2 && fusible && (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-text-muted">
          <span>Combine:</span>
          <button
            type="button"
            onClick={() => fuse("and")}
            className="rounded-md border px-2 py-0.5 font-semibold uppercase tracking-wider"
            style={{ color: "hsl(var(--cat-orange-fg))", borderColor: "hsl(var(--cat-orange-fg))" }}
          >
            and
          </button>
          <button
            type="button"
            onClick={() => fuse("or")}
            className="rounded-md border px-2 py-0.5 font-semibold uppercase tracking-wider"
            style={{ color: "hsl(var(--cat-blue-fg))", borderColor: "hsl(var(--cat-blue-fg))" }}
          >
            or
          </button>
          <button type="button" onClick={clearSelection} className="underline underline-offset-2 hover:text-text">
            cancel
          </button>
        </div>
      )}

      {/* Floating drag ghost that follows the pointer. */}
      {drag && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent bg-surface-raised px-3 py-1 text-[13px] text-text opacity-90 shadow-lg"
          style={{ left: drag.x, top: drag.y }}
        >
          {drag.label}
        </span>
      )}
    </div>
  );
}
