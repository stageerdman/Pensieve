import type { MouseEvent } from "react";
import type { NoteMeta } from "../lib/types";
import { FlaskFor } from "./Flask";
import { Logo } from "./Logo";
import { X } from "./icons";

// The tab strip across the top. The Pensieve logo is the Home button — it returns to
// the note you were working on. After it, a horizontally-scrollable, infinite row of
// open note tabs (⌘-click a note in the sidebar to open one). Each tab shows the
// note's flask + title and an X to close. The active tab is highlighted.

export const HOME = "home";
export type ActiveTab = typeof HOME | string;

interface TabBarProps {
  tabs: NoteMeta[];
  active: ActiveTab;
  onHome: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function TabBar({ tabs, active, onHome, onSelect, onClose }: TabBarProps) {
  const close = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    onClose(id);
  };

  return (
    // The row (and its empty spaces) is a window drag handle; the interactive children
    // below have no drag attribute, so clicking a tab/button still works normally.
    <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-1">
      {/* Home — the Pensieve mark. Always present; returns to your work. */}
      <button
        onClick={onHome}
        aria-label="Home — your work"
        title="Home"
        aria-current={active === HOME ? "true" : undefined}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text transition-colors hover:bg-surface-raised aria-[current=true]:bg-surface-raised"
      >
        <Logo size={18} />
      </button>

      {tabs.length > 0 && <span className="h-5 w-px shrink-0 bg-border" />}

      {/* The open tabs — scroll horizontally when they overflow. */}
      <div
        data-tauri-drag-region
        className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto"
      >
        {tabs.map((n) => {
          const isActive = active === n.id;
          return (
            <div
              key={n.id}
              onClick={() => onSelect(n.id)}
              role="tab"
              aria-selected={isActive}
              className={
                "group flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md border px-2 text-sm " +
                (isActive
                  ? "border-border bg-surface-raised text-text"
                  : "border-transparent text-text-muted hover:bg-surface-raised/60 hover:text-text")
              }
            >
              <FlaskFor icon={n.icon} chars={n.chars} size={13} className="shrink-0" />
              <span className="max-w-[120px] truncate">{n.title || "Untitled"}</span>
              <span
                role="button"
                aria-label="Close tab"
                onClick={(e) => close(e, n.id)}
                className="-mr-0.5 shrink-0 rounded p-0.5 text-text-muted/60 hover:bg-surface hover:text-text"
              >
                <X size={12} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
