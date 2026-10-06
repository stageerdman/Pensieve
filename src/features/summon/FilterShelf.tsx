import { useState } from "react";
import type { FilterNode, Relation } from "../../lib/search/types";
import { canGroup, describe as describeTree } from "../../lib/search/tree";
import { leafLabel } from "../../lib/search/label";
import { isGroup } from "../../lib/search/types";
import { Sparkles } from "../../components/icons";
import { Node, type GroupHandlers } from "./FilterGroupView";

// The stacked-filter shelf under the summon bar. Top-level chips/groups are AND-combined;
// select 2+ and a "combine" control offers AND/OR (fusing into a group). Drop a chip on
// the open area to move it back to the top level. A boolean summary line and a magic
// clear-all icon round it out.

interface Props {
  items: FilterNode[];
  onPop: (id: string) => void;
  onFuse: (ids: string[], relation: Relation) => void;
  onRelate: (groupId: string, relation: Relation) => void;
  onMove: (leafId: string, target: string | null, index: number) => void;
  onClearAll: () => void;
}

export function FilterShelf({ items, onPop, onFuse, onRelate, onMove, onClearAll }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [overRoot, setOverRoot] = useState(false);

  if (items.length === 0) return null;

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
    onPop(id);
  };

  const h: GroupHandlers = {
    selected,
    onToggleSelect: toggleSelect,
    onPop: pop,
    onRelate,
    onDragStart: setDragging,
    onDragEnd: () => setDragging(null),
    onMove,
  };

  const hasGroup = items.some(isGroup);

  return (
    <div className="mt-3">
      <div
        className={
          "flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-xl p-1 transition-shadow " +
          (overRoot ? "summon-drop-active" : "")
        }
        onDragOver={(e) => {
          if (!dragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!overRoot) setOverRoot(true);
        }}
        onDragLeave={(e) => {
          // only clear when leaving the shelf entirely
          if (e.currentTarget === e.target) setOverRoot(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOverRoot(false);
          const id = e.dataTransfer.getData("text/plain");
          if (id) onMove(id, null, items.length);
        }}
      >
        {items.map((node, i) => (
          <div key={node.id} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="select-none text-[10px] uppercase tracking-wider text-text-muted/70">and</span>
            )}
            <Node node={node} h={h} />
          </div>
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

      {selectedIds.length >= 2 && (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-text-muted">
          {fusible ? (
            <>
              <span>Combine {selectedIds.length} filters:</span>
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
            </>
          ) : (
            <span>Can’t combine these — groups nest only one level deep.</span>
          )}
        </div>
      )}

      {hasGroup && (
        <p className="mt-2 select-none font-mono text-[11px] text-text-muted/80">
          {describeTree(items, leafLabel)}
        </p>
      )}
    </div>
  );
}
