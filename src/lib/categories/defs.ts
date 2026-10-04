// Workspace-level category definitions: a name (matches the frontmatter string
// exactly) paired with a palette colour. The .md frontmatter name stays the source
// of truth; this table only adds colour + the canonical ordered list (including
// categories you've created but not yet used on any note).

import type { CategoryColor } from "./palette";

export interface CategoryDef {
  name: string;
  color: CategoryColor;
}

/** Seeds that reproduce the pre-custom-categories look (orange / gray / green). */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { name: "Notes & Lessons", color: "orange" },
  { name: "In my mind", color: "gray" },
  { name: "Execution", color: "green" },
];

/** The colour for a category name — neutral gray if it has no definition yet
 *  (hand-edited note, synced-in, or a deleted definition). Never throws. */
export function colorOf(name: string, defs: CategoryDef[]): CategoryColor {
  return defs.find((d) => d.name === name)?.color ?? "gray";
}
