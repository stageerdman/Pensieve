import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { NoteMeta } from "../../lib/types";
import type { CategoryDef } from "../../lib/categories/defs";
import type { GalleryFields, SnippetLines } from "../../lib/gallery/view";
import { FlaskCard, type MenuAnchor, type PeekTarget } from "./FlaskCard";
import { FlaskFor } from "../../components/Flask";
import { X } from "../../components/icons";

// The working set: a shelf of the memories the owner is actively working with, pinned
// to the top of the gallery and scrolling horizontally. It uses the very same card as
// the main grid (FlaskCard) — same visible text and layout — just laid out in a
// horizontal row instead of a wrapping grid. A memory here is hidden from the grid
// below (it's "moved up", like a pinned note), so this is its only home while pinned.
//
// Reorder by dragging a card left/right within the strip (or Alt+←/→ on a focused one).
// We roll our own pointer-drag rather than HTML5 drag-and-drop: WKWebView (the native
// shell's webview) fires HTML5 drop events unreliably, and it would drag a ghost of the
// whole card. Here we drag just the bottle under the cursor, show a drop indicator for
// where it will land, and commit the reorder on release.
//
// Filled by right-click → Add; emptied by the × (hover) or right-click → Remove. Hidden
// entirely when empty. Click/⌘-click/Alt-click behave exactly as in the grid.

interface WorkingSetStripProps {
  items: NoteMeta[]; // resolved from the working-set ids, in order
  fields: GalleryFields;
  snippetLines: SnippetLines;
  categoryDefs: CategoryDef[];
  now: number;
  onOpen: (id: string, background: boolean) => void;
  onContextMenu: (e: MenuAnchor, id: string) => void;
  onHoverChange: (target: PeekTarget | null) => void;
  onPeekToggle: (target: PeekTarget) => void;
  onToggleWorkingSet: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

// Pointer must travel this far before a press becomes a drag (below it, it's a click
// that opens the memory).
const DRAG_THRESHOLD = 5;
const GAP = 16; // matches the row's gap-4 (1rem)

interface DragState {
  id: string;
  fromIndex: number;
  x: number; // cursor position (for the floating bottle)
  y: number;
  slot: number; // insertion slot, 0..n
  indX: number; // drop-indicator geometry
  indTop: number;
  indHeight: number;
}

export function WorkingSetStrip({
  items,
  fields,
  snippetLines,
  categoryDefs,
  now,
  onOpen,
  onContextMenu,
  onHoverChange,
  onPeekToggle,
  onToggleWorkingSet,
  onRemove,
  onMove,
  onReorder,
}: WorkingSetStripProps) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // The in-flight press: index + start point, and whether it has crossed the threshold
  // into an actual drag. A ref so pointer handlers read fresh values without re-renders.
  const press = useRef<{ id: string; fromIndex: number; startX: number; startY: number; active: boolean } | null>(null);
  // Set the moment a drag ends, to swallow the click that the browser fires next.
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<DragState | null>(null);

  if (items.length === 0) return null;

  // Where would a drop at this cursor X land? Returns the insertion slot (0..n) plus the
  // geometry of the indicator line to draw at that gap.
  const measure = (clientX: number) => {
    const rects = itemRefs.current.map((el) => el?.getBoundingClientRect() ?? null);
    const present = rects.filter((r): r is DOMRect => !!r);
    if (present.length === 0) return { slot: 0, indX: 0, indTop: 0, indHeight: 0 };
    let slot = 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r && clientX > r.left + r.width / 2) slot = i + 1;
    }
    const indX =
      slot < rects.length && rects[slot]
        ? rects[slot]!.left - GAP / 2
        : present[present.length - 1].right + GAP / 2;
    return { slot, indX, indTop: present[0].top, indHeight: present[0].height };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, id: string, index: number) => {
    if (e.button !== 0) return; // left button only
    press.current = { id, fromIndex: index, startX: e.clientX, startY: e.clientY, active: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p) return;
    if (!p.active) {
      if (Math.abs(e.clientX - p.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - p.startY) < DRAG_THRESHOLD)
        return;
      p.active = true;
      // Capture the pointer so moves/release keep coming to this element even as the
      // cursor leaves it (dragging across the row). Guarded — not every webview/test
      // environment implements it, and a bad pointerId can throw.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture unavailable — drag still works while the cursor stays in the row */
      }
    }
    const m = measure(e.clientX);
    setDrag({ id: p.id, fromIndex: p.fromIndex, x: e.clientX, y: e.clientY, ...m });
  };

  const commit = (clientX: number) => {
    const p = press.current;
    press.current = null;
    if (p?.active) {
      const { slot } = measure(clientX);
      const from = p.fromIndex;
      // slot is a gap (0..n); removing `from` shifts everything after it left by one.
      let to = slot > from ? slot - 1 : slot;
      to = Math.max(0, Math.min(items.length - 1, to));
      if (to !== from) onReorder(from, to);
      suppressClick.current = true; // the trailing click must not open the memory
    }
    setDrag(null);
  };

  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      onMove(id, e.key === "ArrowLeft" ? -1 : 1);
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onRemove(id);
    }
  };

  const dragItem = drag ? items.find((n) => n.id === drag.id) : undefined;

  return (
    <div className="mb-8 border-b border-border pb-6">
      <p className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
        Working set
      </p>
      <div
        role="list"
        aria-label="Working set"
        className="no-scrollbar flex items-stretch gap-4 overflow-x-auto pb-1"
      >
        {items.map((n, i) => (
          <div
            key={n.id}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            role="listitem"
            onPointerDown={(e) => onPointerDown(e, n.id, i)}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => commit(e.clientX)}
            onPointerCancel={() => {
              press.current = null;
              setDrag(null);
            }}
            onClickCapture={(e) => {
              if (suppressClick.current) {
                e.stopPropagation();
                e.preventDefault();
                suppressClick.current = false;
              }
            }}
            onKeyDown={(e) => onKey(e, n.id)}
            className={
              "group relative w-[200px] shrink-0 cursor-grab touch-none select-none rounded-lg transition-opacity active:cursor-grabbing " +
              (drag?.id === n.id ? "opacity-30" : "")
            }
          >
            <FlaskCard
              note={n}
              fields={fields}
              snippetLines={snippetLines}
              categoryDefs={categoryDefs}
              now={now}
              inWorkingSet={false}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              onHoverChange={onHoverChange}
              onPeekToggle={onPeekToggle}
              onToggleWorkingSet={onToggleWorkingSet}
            />
            <span
              role="button"
              aria-label="Remove from working set"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(n.id);
              }}
              className="absolute right-2 top-2 z-10 rounded p-0.5 text-text-muted/50 opacity-0 hover:bg-surface hover:text-text group-hover:opacity-100"
            >
              <X size={13} />
            </span>
          </div>
        ))}
      </div>

      {/* The drag feedback: a drop indicator at the target gap, and the lone bottle
          riding under the cursor. Portaled to the body so they sit above everything and
          ignore the row's clipping/scroll. */}
      {drag &&
        dragItem &&
        createPortal(
          <>
            <div
              className="pointer-events-none fixed z-50 w-[3px] rounded-full bg-accent"
              style={{ left: drag.indX - 1.5, top: drag.indTop, height: drag.indHeight }}
            />
            <div
              className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-lg"
              style={{ left: drag.x, top: drag.y }}
            >
              <FlaskFor
                icon={dragItem.icon}
                chars={dragItem.chars}
                seed={dragItem.id}
                size={56}
                label={dragItem.title || "Untitled"}
              />
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
