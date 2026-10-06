// Human label for a committed filter chip (the parser labels suggestions; this labels
// what's already stacked). Kept tiny and pure so chips and the boolean summary agree.

import type { Filter, FilterLeaf, Relation } from "./types";
import { depth } from "./tree";
import type { FilterGroup } from "./types";

export function filterLabel(filter: Filter): string {
  switch (filter.kind) {
    case "tag":
      return filter.tags.length <= 1
        ? `#${filter.tags[0] ?? ""}`
        : filter.tags.map((t) => `#${t}`).join(" or ");
    case "category":
      return filter.categories.join(", ");
    case "date":
      return `${filter.field === "updated" ? "Updated" : "Created"} · ${filter.phrase}`;
    case "flag":
      return filter.flag === "pinned" ? "Pinned" : filter.flag;
    case "title":
      return `title: ${filter.text}`;
    case "text":
      return `"${filter.text}"`;
  }
}

export const leafLabel = (l: FilterLeaf): string => filterLabel(l.filter);

/** The category palette key for a group, encoding its logic in colour:
 *  inner group OR=blue / AND=orange; outer (nested) group OR=purple / AND=red. */
export type PaletteKey = "blue" | "orange" | "purple" | "red";
export function groupPalette(relation: Relation, isOuter: boolean): PaletteKey {
  if (relation === "or") return isOuter ? "purple" : "blue";
  return isOuter ? "red" : "orange";
}

/** A group is "outer" when it contains another group (nesting depth 2). */
export function isOuterGroup(g: FilterGroup): boolean {
  return depth(g) >= 2;
}
