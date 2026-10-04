// Load/save the category definitions. These are workspace DATA (the canonical list
// + colours, incl. unused categories), not a device preference — so they live in the
// vault at <vault>/categories.json via the same read_text/write_text commands the
// note store uses, travelling with backup/sync. In the browser (dev) they mirror to
// localStorage. First load seeds the defaults (additive migration — note files are
// never touched).

import { CATEGORY_COLORS, type CategoryColor } from "./palette";
import { DEFAULT_CATEGORIES, type CategoryDef } from "./defs";
import { log } from "../logger";

const FILE = "categories.json";
const LS_KEY = "pensieve:categories";
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface Stored {
  version: number;
  categories: CategoryDef[];
}

function sanitize(parsed: unknown): CategoryDef[] {
  const list = (parsed as Stored)?.categories ?? (parsed as CategoryDef[]);
  if (!Array.isArray(list)) return [...DEFAULT_CATEGORIES];
  const out: CategoryDef[] = [];
  for (const d of list) {
    const name = typeof d?.name === "string" ? d.name.trim() : "";
    if (!name || out.some((x) => x.name === name)) continue;
    const color: CategoryColor = CATEGORY_COLORS.includes(d.color) ? d.color : "gray";
    out.push({ name, color });
  }
  return out.length ? out : [...DEFAULT_CATEGORIES];
}

export async function loadCategoryDefs(): Promise<CategoryDef[]> {
  try {
    if (inTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string | null>("read_text", { rel: FILE });
      if (!raw) {
        await saveCategoryDefs(DEFAULT_CATEGORIES);
        return [...DEFAULT_CATEGORIES];
      }
      return sanitize(JSON.parse(raw));
    }
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      await saveCategoryDefs(DEFAULT_CATEGORIES);
      return [...DEFAULT_CATEGORIES];
    }
    return sanitize(JSON.parse(raw));
  } catch {
    log.warn("categories", "load.failed");
    return [...DEFAULT_CATEGORIES];
  }
}

export async function saveCategoryDefs(defs: CategoryDef[]): Promise<void> {
  const payload = JSON.stringify({ version: 1, categories: defs } satisfies Stored);
  try {
    if (inTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_text", { rel: FILE, contents: payload });
    } else {
      localStorage.setItem(LS_KEY, payload);
    }
    log.debug("categories", "save", { count: defs.length });
  } catch {
    log.warn("categories", "save.failed");
  }
}
