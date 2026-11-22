import type { KeyboardEvent } from "react";
import type { MenuAnchor, PeekTarget } from "./FlaskCard";

// The one keyboard map for a memory you can open from Home — a gallery card or a search
// result row. Enter / ⌘Enter open (⌘/Ctrl/Alt → background tab); Space peeks (instead of
// activating the button); `w` toggles the working set; `s` stars; Shift+F10 opens the
// context menu at the element.

export interface CardKeyActions {
  id: string;
  el: HTMLElement | null;
  onOpen: (id: string, background: boolean) => void;
  onPeekToggle: (target: PeekTarget) => void;
  onToggleWorkingSet: (id: string) => void;
  onToggleStar?: (id: string) => void;
  onContextMenu: (e: MenuAnchor, id: string) => void;
}

export function onCardKeyDown(e: KeyboardEvent<HTMLElement>, a: CardKeyActions): void {
  if (e.key === "Enter") {
    e.preventDefault();
    a.onOpen(a.id, e.metaKey || e.ctrlKey || e.altKey);
  } else if (e.key === " ") {
    e.preventDefault();
    if (a.el) a.onPeekToggle({ id: a.id, el: a.el });
  } else if (e.key.toLowerCase() === "w") {
    e.preventDefault();
    a.onToggleWorkingSet(a.id);
  } else if (e.key.toLowerCase() === "s" && a.onToggleStar && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    a.onToggleStar(a.id);
  } else if (e.shiftKey && e.key === "F10") {
    e.preventDefault();
    const r = a.el?.getBoundingClientRect();
    if (r) a.onContextMenu({ preventDefault() {}, clientX: r.left + 12, clientY: r.bottom - 12 }, a.id);
  }
}
