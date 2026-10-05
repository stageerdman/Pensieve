import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bookmark } from "../../components/icons";

// The lightweight right-click menu for a flask (in the grid or the working-set strip).
// A custom popover — never a native confirm/alert (design.md: no blocking dialogs).
// Closes on outside mousedown, Esc, or any action. Add/remove working set applies
// immediately (trivially reversible, so no confirmation friction).

export interface CardMenuTarget {
  id: string;
  x: number;
  y: number;
  inWorkingSet: boolean;
}

interface CardContextMenuProps {
  target: CardMenuTarget;
  onOpen: (id: string, background: boolean) => void;
  onPeek: (id: string) => void;
  onToggleWorkingSet: (id: string) => void;
  onClose: () => void;
}

export function CardContextMenu({
  target,
  onOpen,
  onPeek,
  onToggleWorkingSet,
  onClose,
}: CardContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Keep the menu on screen and move keyboard focus into it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    let left = target.x;
    let top = target.y;
    if (left + el.offsetWidth > window.innerWidth - margin)
      left = window.innerWidth - el.offsetWidth - margin;
    if (top + el.offsetHeight > window.innerHeight - margin)
      top = window.innerHeight - el.offsetHeight - margin;
    setPos({ left: Math.max(margin, left), top: Math.max(margin, top) });
    el.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  }, [target]);

  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-40 min-w-[200px] rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
    >
      <Item label="Open" shortcut="⏎" onSelect={act(() => onOpen(target.id, false))} />
      <Item
        label="Open in background tab"
        shortcut="⌘⏎"
        onSelect={act(() => onOpen(target.id, true))}
      />
      <Item label="Peek" shortcut="Space" onSelect={act(() => onPeek(target.id))} />
      <div className="my-1 border-t border-border" />
      <Item
        icon={<Bookmark size={15} filled={target.inWorkingSet} />}
        label={target.inWorkingSet ? "Remove from Working set" : "Add to Working set"}
        shortcut="W"
        onSelect={act(() => onToggleWorkingSet(target.id))}
      />
    </div>
  );
}

function Item({
  icon,
  label,
  shortcut,
  onSelect,
}: {
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-text hover:bg-surface focus:bg-surface focus:outline-none"
    >
      {icon && <span className="w-4 text-text-muted">{icon}</span>}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-xs text-text-muted">{shortcut}</span>}
    </button>
  );
}
