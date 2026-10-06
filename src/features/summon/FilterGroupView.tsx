import type { Filter, FilterGroup, FilterNode, Relation } from "../../lib/search/types";
import { isGroup } from "../../lib/search/types";
import { groupPalette, isOuterGroup } from "../../lib/search/label";
import { FilterChip } from "./FilterChip";

// A group of filters, its colour encoding the logic (inner OR=blue/AND=orange, outer
// OR=purple/AND=red). The AND/OR badge is the single relation selector — no connector
// words between chips. Marked as a pointer-drag drop target (`data-drop-group`) and
// highlighted when a dragged chip hovers it or any drag is active.

export interface GroupHandlers {
  selected: Set<string>;
  editingId: string | null;
  dragging: string | null; // id of the chip being dragged, or null
  dropId: string | null | undefined; // the group id currently hovered (null = top level)
  ctx: { tags: string[]; categories: string[]; now: number };
  onChipClick: (id: string, shift: boolean) => void;
  onChipPointerDown: (id: string, label: string, e: React.PointerEvent) => void;
  onEditClose: () => void;
  onReplace: (id: string, filter: Filter) => void;
  onPop: (id: string) => void;
  onRelate: (groupId: string, relation: Relation) => void;
}

export function FilterGroupView({ group, h }: { group: FilterGroup; h: GroupHandlers }) {
  const key = groupPalette(group.relation, isOuterGroup(group));
  const fg = `hsl(var(--cat-${key}-fg))`;
  const bg = `hsl(var(--cat-${key}-bg) / 0.28)`;
  const over = h.dropId === group.id;
  const droppable = h.dragging !== null && !group.children.some((c) => c.id === h.dragging);

  return (
    <span
      data-drop-group={group.id}
      className={"inline-flex items-center gap-1.5 rounded-xl border px-1.5 py-1 " + (over ? "summon-drop-active" : "")}
      style={{ borderColor: fg, background: bg, borderStyle: droppable && !over ? "dashed" : "solid" }}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => h.onRelate(group.id, group.relation === "and" ? "or" : "and")}
        title="Toggle AND / OR"
        className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: fg, border: `1px solid ${fg}` }}
      >
        {group.relation}
      </button>
      {group.children.map((child) => (
        <Node key={child.id} node={child} h={h} />
      ))}
    </span>
  );
}

/** A child is either a leaf (chip) or a nested group. */
export function Node({ node, h }: { node: FilterNode; h: GroupHandlers }) {
  if (isGroup(node)) return <FilterGroupView group={node} h={h} />;
  return (
    <FilterChip
      leaf={node}
      selected={h.selected.has(node.id)}
      editing={h.editingId === node.id}
      ctx={h.ctx}
      onClick={h.onChipClick}
      onPointerDown={h.onChipPointerDown}
      onEditClose={h.onEditClose}
      onReplace={h.onReplace}
      onPop={h.onPop}
    />
  );
}
