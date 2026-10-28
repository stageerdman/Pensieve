// Workspace-level category definitions: a name (matches the frontmatter string
// exactly) paired with a palette colour. The .md frontmatter name stays the source
// of truth; this table only adds colour + the canonical ordered list (including
// categories you've created but not yet used on any note).

import type { CategoryColor } from "./palette";

export interface CategoryDef {
  name: string;
  color: CategoryColor;
}

/** The three real note types (what kind of thing this is) plus Trash, a
 *  utility holding pen that isn't a type. Everything else is a tag, not a
 *  category — see updates/2026-10-28 NOTION-IMPORT/wiki.md. */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { name: "Journal", color: "blue" },
  { name: "Execution", color: "green" },
  { name: "Idea", color: "yellow" },
  { name: "Trash", color: "gray" },
];

/** The colour for a category name — neutral gray if it has no definition yet
 *  (hand-edited note, synced-in, or a deleted definition). Never throws. */
export function colorOf(name: string, defs: CategoryDef[]): CategoryColor {
  return defs.find((d) => d.name === name)?.color ?? "gray";
}
