import type { Note, NoteFields } from "../lib/types";
import type { CategoryApi } from "../hooks/useCategoryDefs";
import { CategoryDropdown } from "./CategoryDropdown";

// One note's category picker, wired to the note: toggling a category adds/removes
// it on the note; add / recolour / delete go to the shared category definitions.
// Used beside the flask above the editor (inline) and in the Details panel (field),
// so both surfaces stay identical in behaviour.

interface NoteCategoryControlProps {
  value: string[];
  categories: CategoryApi;
  updateMeta: (partial: Partial<NoteFields> | ((note: Note) => Partial<NoteFields>)) => void;
  variant?: "field" | "inline";
}

export function NoteCategoryControl({
  value,
  categories,
  updateMeta,
  variant,
}: NoteCategoryControlProps) {
  return (
    <CategoryDropdown
      value={value}
      defs={categories.defs}
      variant={variant}
      onToggle={(c) =>
        // Functional update so rapid toggles never clobber each other.
        updateMeta((n) => ({
          categories: n.categories.includes(c)
            ? n.categories.filter((x) => x !== c)
            : [...n.categories, c],
        }))
      }
      onAdd={categories.addCategory}
      onSetColor={categories.setColor}
      onRemove={categories.removeCategory}
    />
  );
}
