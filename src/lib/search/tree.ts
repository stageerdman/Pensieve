// Pure mutations on the filter group-tree (the stacked chips). The React shelf calls
// these and animates the result; all the fiddly invariants live here where they're
// testable:
//   • top-level items are implicitly AND-combined;
//   • a group has an explicit AND/OR relation and 2+ children;
//   • NO group of one — any group left with <2 children dissolves (its child is promoted);
//   • nesting is capped at depth 2 (a group may contain a group, once — not deeper).
// Everything returns new arrays/objects so React sees fresh references.

import type { FilterNode, FilterGroup, FilterLeaf, Relation } from "./types";
import { isGroup } from "./types";

/** Group-nesting depth: a leaf is 0, a group of leaves is 1, a group containing a group
 *  is 2, … (leaves don't add depth). */
export function depth(node: FilterNode): number {
  if (!isGroup(node)) return 0;
  return 1 + node.children.reduce((m, c) => Math.max(m, depth(c)), 0);
}

/** Dissolve any group with <2 children (promote a lone child; drop an empty one). Applied
 *  bottom-up so cascades resolve in one pass. */
export function normalize(items: FilterNode[]): FilterNode[] {
  const out: FilterNode[] = [];
  for (const node of items) {
    if (!isGroup(node)) {
      out.push(node);
      continue;
    }
    const children = normalize(node.children);
    if (children.length === 0) continue; // drop empty group
    if (children.length === 1) {
      out.push(children[0]); // promote the lone child — "no group of one"
      continue;
    }
    out.push({ ...node, children });
  }
  return out;
}

/** Remove a node (leaf or group) anywhere in the tree by id; returns the new tree and the
 *  removed node (or null). Does NOT normalize — callers decide. */
function extract(items: FilterNode[], id: string): { items: FilterNode[]; removed: FilterNode | null } {
  let removed: FilterNode | null = null;
  const walk = (list: FilterNode[]): FilterNode[] => {
    const out: FilterNode[] = [];
    for (const node of list) {
      if (node.id === id) {
        removed = node;
        continue;
      }
      if (isGroup(node)) out.push({ ...node, children: walk(node.children) });
      else out.push(node);
    }
    return out;
  };
  return { items: walk(items), removed };
}

/** Remove a chip/group and clean up (dissolve any group-of-one that results). */
export function removeNode(items: FilterNode[], id: string): FilterNode[] {
  return normalize(extract(items, id).items);
}

/** Find a node by id (deep). */
export function findNode(items: FilterNode[], id: string): FilterNode | null {
  for (const node of items) {
    if (node.id === id) return node;
    if (isGroup(node)) {
      const hit = findNode(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Can these TOP-LEVEL nodes be fused into one group without exceeding depth 2? */
export function canGroup(items: FilterNode[], ids: string[]): boolean {
  if (ids.length < 2) return false;
  const topIds = new Set(items.map((n) => n.id));
  if (!ids.every((id) => topIds.has(id))) return false; // only top-level fusing (v1)
  const selected = items.filter((n) => ids.includes(n.id));
  // Wrapping creates a group of depth 1 + max(child depth); must stay ≤ 2.
  return 1 + selected.reduce((m, n) => Math.max(m, depth(n)), 0) <= 2;
}

/** Fuse the given top-level nodes into a new group (relation) placed where the first one
 *  was. No-op (returns the input) if the fuse is invalid. `newId` is supplied by the
 *  caller so this stays deterministic/testable. */
export function group(
  items: FilterNode[],
  ids: string[],
  relation: Relation,
  newId: string,
): FilterNode[] {
  if (!canGroup(items, ids)) return items;
  const selected = items.filter((n) => ids.includes(n.id));
  const firstIdx = items.findIndex((n) => ids.includes(n.id));
  const grp: FilterGroup = { type: "group", id: newId, relation, children: selected };
  const out: FilterNode[] = [];
  items.forEach((n, i) => {
    if (i === firstIdx) out.push(grp);
    if (!ids.includes(n.id)) out.push(n);
  });
  return out;
}

/** Explode a group back into its children at the group's position. */
export function ungroup(items: FilterNode[], groupId: string): FilterNode[] {
  const out: FilterNode[] = [];
  for (const node of items) {
    if (node.id === groupId && isGroup(node)) out.push(...node.children);
    else if (isGroup(node)) out.push({ ...node, children: ungroup(node.children, groupId) });
    else out.push(node);
  }
  return normalize(out);
}

/** Flip a group's AND/OR relation. */
export function setRelation(items: FilterNode[], groupId: string, relation: Relation): FilterNode[] {
  return items.map((node) => {
    if (node.id === groupId && isGroup(node)) return { ...node, relation };
    if (isGroup(node)) return { ...node, children: setRelation(node.children, groupId, relation) };
    return node;
  });
}

/** Move a LEAF to a target container (null = top level) at `index`, then clean up. Groups
 *  are re-parented via group/ungroup, not this. No-op if `leafId` isn't a leaf, or the
 *  move would exceed depth (it can't, since a leaf has depth 0). */
export function moveLeaf(
  items: FilterNode[],
  leafId: string,
  targetGroupId: string | null,
  index: number,
): FilterNode[] {
  const found = findNode(items, leafId);
  if (!found || isGroup(found)) return items;
  const leaf = found as FilterLeaf;

  const { items: without } = extract(items, leafId);

  if (targetGroupId === null) {
    const clamped = Math.max(0, Math.min(index, without.length));
    const out = [...without.slice(0, clamped), leaf, ...without.slice(clamped)];
    return normalize(out);
  }

  const insert = (list: FilterNode[]): FilterNode[] =>
    list.map((node) => {
      if (node.id === targetGroupId && isGroup(node)) {
        const clamped = Math.max(0, Math.min(index, node.children.length));
        return { ...node, children: [...node.children.slice(0, clamped), leaf, ...node.children.slice(clamped)] };
      }
      if (isGroup(node)) return { ...node, children: insert(node.children) };
      return node;
    });

  return normalize(insert(without));
}

/** Append a new leaf at the top level (caller supplies the instance id). */
export function appendLeaf(items: FilterNode[], leaf: FilterLeaf): FilterNode[] {
  return [...items, leaf];
}

/** A compact human-readable boolean summary, for debugging + a live hint line. */
export function describe(items: FilterNode[], labelOf: (leaf: FilterLeaf) => string): string {
  const node = (n: FilterNode): string => {
    if (!isGroup(n)) return labelOf(n);
    const sep = n.relation === "or" ? " OR " : " AND ";
    return "(" + n.children.map(node).join(sep) + ")";
  };
  return items.map(node).join(" AND ");
}
