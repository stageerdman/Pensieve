import { useState } from "react";
import type { FilterLeaf } from "../../lib/search/types";
import { filterLabel } from "../../lib/search/label";

// One stacked filter as a pill. Left-click toggles selection (for shift-fuse). Right-
// click (release) pops it like a bubble and removes it. Draggable so it can be moved in
// and out of groups. Dumb: all state changes go up through callbacks.

interface Props {
  leaf: FilterLeaf;
  selected: boolean;
  onToggleSelect: (id: string, additive: boolean) => void;
  onPop: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

const BUBBLES = [
  { dx: "-14px", dy: "-12px" },
  { dx: "12px", dy: "-14px" },
  { dx: "16px", dy: "6px" },
  { dx: "-16px", dy: "8px" },
  { dx: "0px", dy: "-18px" },
];

export function FilterChip({ leaf, selected, onToggleSelect, onPop, onDragStart, onDragEnd }: Props) {
  const [popping, setPopping] = useState(false);

  const pop = () => {
    if (popping) return;
    setPopping(true);
    window.setTimeout(() => onPop(leaf.id), 250);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        draggable={!popping}
        data-leaf-id={leaf.id}
        onClick={(e) => onToggleSelect(leaf.id, e.shiftKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          pop();
        }}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", leaf.id);
          e.dataTransfer.effectAllowed = "move";
          onDragStart(leaf.id);
        }}
        onDragEnd={onDragEnd}
        title={`${filterLabel(leaf.filter)} — click to select, right-click to remove, drag to group`}
        className={
          "summon-chip-in inline-flex cursor-grab items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] " +
          "transition-colors active:cursor-grabbing " +
          (popping ? "summon-popping " : "") +
          (selected
            ? "border-accent bg-accent/15 text-text"
            : "border-border bg-surface-raised text-text-muted hover:text-text hover:border-accent/40")
        }
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
        {filterLabel(leaf.filter)}
      </button>
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
