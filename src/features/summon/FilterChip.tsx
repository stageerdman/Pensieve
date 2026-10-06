import { useState } from "react";
import type { Filter, FilterLeaf } from "../../lib/search/types";
import { filterLabel } from "../../lib/search/label";
import { FilterEditPopover } from "./FilterEditPopover";

// One stacked filter as a pill.
//   • left-click  → edit the filter (popover)
//   • shift-click → select it (for shift-fusing two chips into a group)
//   • drag        → move it into/out of a group (pointer-based, so it works in the
//                   native WKWebView where HTML5 drag-and-drop is unreliable)
//   • right-click → pop it like a bubble and remove it
// Dumb: all state changes go up through callbacks.

interface Props {
  leaf: FilterLeaf;
  selected: boolean;
  editing: boolean;
  ctx: { tags: string[]; categories: string[]; now: number };
  onClick: (id: string, shift: boolean) => void;
  onPointerDown: (id: string, label: string, e: React.PointerEvent) => void;
  onEditClose: () => void;
  onReplace: (id: string, filter: Filter) => void;
  onPop: (id: string) => void;
}

const BUBBLES = [
  { dx: "-14px", dy: "-12px" },
  { dx: "12px", dy: "-14px" },
  { dx: "16px", dy: "6px" },
  { dx: "-16px", dy: "8px" },
  { dx: "0px", dy: "-18px" },
];

export function FilterChip({
  leaf,
  selected,
  editing,
  ctx,
  onClick,
  onPointerDown,
  onEditClose,
  onReplace,
  onPop,
}: Props) {
  const [popping, setPopping] = useState(false);
  const label = filterLabel(leaf.filter);

  const pop = () => {
    if (popping) return;
    setPopping(true);
    window.setTimeout(() => onPop(leaf.id), 250);
  };

  return (
    <span className="relative inline-flex" data-leaf-id={leaf.id}>
      <button
        type="button"
        onPointerDown={(e) => onPointerDown(leaf.id, label, e)}
        onClick={(e) => onClick(leaf.id, e.shiftKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          pop();
        }}
        title={`${label} — click to edit · shift-click to group · drag to move · right-click to remove`}
        className={
          "summon-chip-in inline-flex cursor-grab touch-none items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] " +
          "transition-colors active:cursor-grabbing " +
          (popping ? "summon-popping " : "") +
          (selected
            ? "border-accent bg-accent/15 text-text"
            : editing
              ? "border-accent/60 bg-surface text-text"
              : "border-border bg-surface-raised text-text-muted hover:text-text hover:border-accent/40")
        }
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
        {label}
      </button>

      {editing && (
        <FilterEditPopover
          filter={leaf.filter}
          ctx={ctx}
          onReplace={(f) => onReplace(leaf.id, f)}
          onClose={onEditClose}
        />
      )}

      {popping &&
        BUBBLES.map((b, i) => (
          <span
            key={i}
            className="summon-bubble"
            style={{ left: "50%", top: "50%", ["--dx" as string]: b.dx, ["--dy" as string]: b.dy }}
            aria-hidden
          />
        ))}
    </span>
  );
}
