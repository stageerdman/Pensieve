import { useState, type ReactNode } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { IconButton } from "./IconButton";
import { MoreHorizontal } from "./icons";

// The "⋯" overflow menu — the extension point for per-note actions. Today it holds
// one item (Timeline); more can be added without touching the header. A tiny
// custom dropdown (no dependency): closes on outside-click and Esc.

export interface MenuItem {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
  active?: boolean;
}

export function OverflowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(() => setOpen(false), { enabled: open });

  return (
    <div ref={ref} className="relative">
      <IconButton
        label="More actions"
        title="More"
        active={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal />
      </IconButton>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 min-w-[180px] rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm " +
                (it.active ? "text-text" : "text-text hover:bg-surface")
              }
            >
              <span className="text-text-muted">{it.icon}</span>
              <span className="flex-1">{it.label}</span>
              {it.shortcut && (
                <span className="text-xs text-text-muted">{it.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
