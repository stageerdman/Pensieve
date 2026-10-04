import { useCallback, useEffect, useState } from "react";
import { CATEGORY_COLORS, type CategoryColor } from "../lib/categories/palette";
import { DEFAULT_CATEGORIES, type CategoryDef } from "../lib/categories/defs";
import { loadCategoryDefs, saveCategoryDefs } from "../lib/categories/store";

// Owns the workspace category definitions (name → colour) and persists every change.
// Mutations are deliberate and infrequent, so they save immediately.

export interface CategoryApi {
  defs: CategoryDef[];
  /** Add a category (no-op if the name already exists); auto-picks an unused colour. */
  addCategory: (name: string) => void;
  /** Set a category's colour; creates the definition if the name has none yet (adopt). */
  setColor: (name: string, color: CategoryColor) => void;
  /** Remove a definition. Notes keep the name (it degrades to a neutral label). */
  removeCategory: (name: string) => void;
}

function nextColor(defs: CategoryDef[]): CategoryColor {
  const used = new Set(defs.map((d) => d.color));
  return CATEGORY_COLORS.find((c) => !used.has(c)) ?? "gray";
}

export function useCategoryDefs(): CategoryApi {
  const [defs, setDefs] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    void loadCategoryDefs().then(setDefs);
  }, []);

  const commit = useCallback((next: CategoryDef[]) => {
    setDefs(next);
    void saveCategoryDefs(next);
  }, []);

  const addCategory = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setDefs((cur) => {
        if (cur.some((d) => d.name === trimmed)) return cur;
        const next = [...cur, { name: trimmed, color: nextColor(cur) }];
        void saveCategoryDefs(next);
        return next;
      });
    },
    [],
  );

  const setColor = useCallback(
    (name: string, color: CategoryColor) => {
      setDefs((cur) => {
        const next = cur.some((d) => d.name === name)
          ? cur.map((d) => (d.name === name ? { ...d, color } : d))
          : [...cur, { name, color }]; // adopt an orphan name
        void saveCategoryDefs(next);
        return next;
      });
    },
    [],
  );

  const removeCategory = useCallback(
    (name: string) => commit(defs.filter((d) => d.name !== name)),
    [commit, defs],
  );

  return { defs, addCategory, setColor, removeCategory };
}
