import type { KeyboardEvent, MouseEvent } from "react";
import type { NoteMeta } from "../../lib/types";
import { FlaskFor } from "../../components/Flask";
import { X } from "../../components/icons";

// The working set: a shelf of flasks the owner is actively working with, pinned to the
// top of the gallery and scrolling horizontally. Filled by right-click → Add; emptied
// by the × or right-click → Remove. Always on top, hidden entirely when empty (it earns
// its place only once it holds something). Click opens+switches, ⌘/Ctrl-click opens a
// background tab (same as the grid). Alt+←/→ reorders a focused item.

interface WorkingSetStripProps {
  items: NoteMeta[]; // resolved from the working-set ids, in order
  onOpen: (id: string, background: boolean) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onContextMenu: (e: MouseEvent, id: string) => void;
}

export function WorkingSetStrip({
  items,
  onOpen,
  onRemove,
  onMove,
  onContextMenu,
}: WorkingSetStripProps) {
  if (items.length === 0) return null;

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
        className="no-scrollbar flex items-stretch gap-2 overflow-x-auto"
      >
        {items.map((n) => (
          <div
            key={n.id}
            role="listitem"
            tabIndex={0}
            onClick={(e) => onOpen(n.id, e.metaKey || e.ctrlKey)}
            onContextMenu={(e) => onContextMenu(e, n.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(n.id, e.metaKey || e.ctrlKey);
              else onKey(e, n.id);
            }}
            aria-label={n.title || "Untitled"}
            className="group relative flex w-[132px] shrink-0 cursor-default flex-col items-center gap-1 rounded-lg border border-border bg-surface p-2 text-center transition-colors hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <FlaskFor icon={n.icon} chars={n.chars} size={34} label={n.title || "Untitled"} />
            <span className="w-full truncate text-xs text-text">{n.title || "Untitled"}</span>
            <span
              role="button"
              aria-label="Remove from working set"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(n.id);
              }}
              className="absolute right-1 top-1 rounded p-0.5 text-text-muted/50 opacity-0 hover:bg-surface hover:text-text group-hover:opacity-100"
            >
              <X size={12} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
