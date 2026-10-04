import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import { X } from "./icons";

// The shared right-dock shell — one home for the Timeline and Details panels so
// they share width, border, header and close affordance. Only one is ever open at
// a time (the parent enforces mutual exclusion).

interface RightPanelProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function RightPanel({ title, onClose, children }: RightPanelProps) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="truncate text-sm text-text-muted">{title}</span>
        <IconButton onClick={onClose} label="Close panel" title="Close  Esc">
          <X size={16} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
    </aside>
  );
}
