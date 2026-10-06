// The query model for Summon (search). Pure data — no store, no DOM — so the parser and
// evaluator that build and consume it are trivially unit-testable.
//
// Two layers:
//  1. Filters — one concrete, selectable constraint (a tag set, a category set, a date
//     range, a flag, a title/text match). Everything except live full-text becomes a
//     stacked chip.
//  2. The group tree — how stacked chips combine. Top-level items are AND-combined; a
//     group overrides the relation (AND/OR) for its children. Nesting is allowed to
//     depth 2 (a group inside a group, once) — enforced by the UI, not the types.

/** Which timestamp a date filter ranges over. */
export type DateField = "created" | "updated";

/** Inclusive millisecond range [start, end]. */
export interface DateRange {
  start: number;
  end: number;
}

/** Flags are boolean note properties we can filter on. Extensible. */
export type FlagKind = "pinned";

/** One concrete constraint. `tag`/`category` are ONE-OF sets: a note matches if it has
 *  ANY of the listed values (this is how "tag contains one of #A, #B" is represented). */
export type Filter =
  | { kind: "tag"; tags: string[] }
  | { kind: "category"; categories: string[] }
  | { kind: "date"; field: DateField; range: DateRange; phrase: string }
  | { kind: "flag"; flag: FlagKind }
  | { kind: "title"; text: string }
  | { kind: "text"; text: string };

/** How a group's children combine. */
export type Relation = "and" | "or";

/** A leaf in the group tree: one filter as one chip. */
export interface FilterLeaf {
  type: "leaf";
  id: string;
  filter: Filter;
}

/** A group of chips combined by `relation`. Children are leaves or (nested once) groups. */
export interface FilterGroup {
  type: "group";
  id: string;
  relation: Relation;
  children: FilterNode[];
}

export type FilterNode = FilterLeaf | FilterGroup;

/** The full stacked-filter state the gallery filters by. Top-level `items` are AND-
 *  combined; `text` is the live full-text query (never a chip). */
export interface FilterQuery {
  text: string;
  items: FilterNode[];
}

export const EMPTY_QUERY: FilterQuery = { text: "", items: [] };

export function isGroup(n: FilterNode): n is FilterGroup {
  return n.type === "group";
}
export function isLeaf(n: FilterNode): n is FilterLeaf {
  return n.type === "leaf";
}
