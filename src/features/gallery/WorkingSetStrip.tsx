import { useState, type KeyboardEvent } from "react";
import type { NoteMeta } from "../../lib/types";
import type { CategoryDef } from "../../lib/categories/defs";
import type { GalleryFields, SnippetLines } from "../../lib/gallery/view";
import { FlaskCard, type MenuAnchor, type PeekTarget } from "./FlaskCard";
import { X } from "../../components/icons";

// The working set: a shelf of the memories the owner is actively working with, pinned
// to the top of the gallery and scrolling horizontally. It uses the very same card as
// the main grid (FlaskCard) — same visible text and layout — just laid out in a
// horizontal row instead of a wrapping grid. A memory here is hidden from the grid
// below (it's "moved up", like a pinned note), so this is its only home while pinned.
//
// Reorder by dragging a card left/right within the strip (or Alt+←/→ on a focused one).
// Filled by right-click → Add; emptied by the × (hover) or right-click → Remove. Hidden
// entirely when empty — it earns its place only once it holds something. Click/⌘-click/
// Alt-click behave exactly as in the grid (FlaskCard owns that).

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
  // Index being dragged and the index it's hovering over (for the drop indicator).
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
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
            role="listitem"
            draggable
            onDragStart={(e) => {
              setDragIndex(i);
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", n.id);
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
              if (overIndex !== i) setOverIndex(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
              endDrag();
            }}
            onDragEnd={endDrag}
            onKeyDown={(e) => onKey(e, n.id)}
            className={
              "group relative w-[200px] shrink-0 rounded-lg transition-opacity " +
              (dragIndex === i ? "opacity-40 " : "") +
              (overIndex === i && dragIndex !== null && dragIndex !== i
                ? "ring-2 ring-accent"
                : "")
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
    </div>
  );
}
