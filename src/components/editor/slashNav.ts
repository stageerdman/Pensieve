// Pure keyboard-navigation reducer for our custom slash menu (SlashMenu.tsx).
//
// Why ours: under `slashMenu={false}` + a custom SuggestionMenuController, BlockNote's
// built-in menu keyboard handling didn't drive selection in the WKWebView shell (arrows
// moved the editor caret instead of the highlight). So we render our own menu component and
// own the keys. This reducer is the provable core — the component is a thin shell over it.
//
// Keys: ArrowDown / Tab → next (wraps); ArrowUp / Shift+Tab → previous (wraps);
// Home/End → first/last; Enter → activate the highlighted item; Escape → close.

export type SlashNav =
  | { type: "move"; index: number }
  | { type: "activate"; index: number }
  | { type: "close" }
  | { type: "none" };

/** Given the current highlighted index, a key, the Shift state, and the item count,
 *  return what should happen. Pure — no DOM, no side effects. */
export function slashNav(index: number, key: string, shift: boolean, count: number): SlashNav {
  if (key === "Escape") return { type: "close" };
  if (count <= 0) return { type: "none" };

  const i = Number.isFinite(index) ? Math.min(Math.max(0, index), count - 1) : 0;
  const next = key === "ArrowDown" || (key === "Tab" && !shift);
  const prev = key === "ArrowUp" || (key === "Tab" && shift);

  if (next) return { type: "move", index: (i + 1) % count };
  if (prev) return { type: "move", index: (i - 1 + count) % count };
  if (key === "Home") return { type: "move", index: 0 };
  if (key === "End") return { type: "move", index: count - 1 };
  if (key === "Enter") return { type: "activate", index: i };
  return { type: "none" };
}

/** The keys slashNav acts on — the component only intercepts (preventDefault/stop) these,
 *  so ordinary typing still flows to the editor to update the query. */
export function isSlashNavKey(key: string): boolean {
  return (
    key === "ArrowDown" ||
    key === "ArrowUp" ||
    key === "Tab" ||
    key === "Home" ||
    key === "End" ||
    key === "Enter" ||
    key === "Escape"
  );
}
