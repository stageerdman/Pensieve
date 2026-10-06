import { Fragment, useState } from "react";
import type { FilterGroup, FilterNode, Relation } from "../../lib/search/types";
import { isGroup } from "../../lib/search/types";
import { groupPalette, isOuterGroup } from "../../lib/search/label";
import { FilterChip } from "./FilterChip";

// A group of filters, its colour encoding the logic (inner OR=blue/AND=orange, outer
// OR=purple/AND=red). The AND/OR badge toggles the relation; faint connectors between
// children give a second read of the boolean. Accepts a dragged chip as a drop target.

interface Handlers {
  selected: Set<string>;
  onToggleSelect: (id: string, additive: boolean) => void;
  onPop: (id: string) => void;
  onRelate: (groupId: string, relation: Relation) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (leafId: string, target: string | null, index: number) => void;
}

export function FilterGroupView({ group, h }: { group: FilterGroup; h: Handlers }) {
  const [over, setOver] = useState(false);
  const key = groupPalette(group.relation, isOuterGroup(group));
  const fg = `hsl(var(--cat-${key}-fg))`;
  const bg = `hsl(var(--cat-${key}-bg) / 0.28)`;

  return (
    <span
      className={"inline-flex items-center gap-1.5 rounded-xl border px-1.5 py-1 " + (over ? "summon-drop-active" : "")}
      style={{ borderColor: fg, background: bg }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) h.onMove(id, group.id, group.children.length);
      }}
    >
      <button
        type="button"
        onClick={() => h.onRelate(group.id, group.relation === "and" ? "or" : "and")}
        title="Toggle AND / OR"
        className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: fg, border: `1px solid ${fg}` }}
      >
        {group.relation}
      </button>
      {group.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && (
            <span className="select-none text-[10px] italic" style={{ color: fg, opacity: 0.8 }}>
              {group.relation}
            </span>
          )}
          <Node node={child} h={h} />
        </Fragment>
      ))}
    </span>
  );
}

/** A child is either a leaf (chip) or a nested group. */
export function Node({ node, h }: { node: FilterNode; h: Handlers }) {
  if (isGroup(node)) return <FilterGroupView group={node} h={h} />;
  return (
    <FilterChip
      leaf={node}
      selected={h.selected.has(node.id)}
      onToggleSelect={h.onToggleSelect}
      onPop={h.onPop}
      onDragStart={h.onDragStart}
      onDragEnd={h.onDragEnd}
    />
  );
}

export type { Handlers as GroupHandlers };
