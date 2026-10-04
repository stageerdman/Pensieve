import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Category } from "../lib/types";

// Category as a multi-select dropdown (a note can have several). Collapsed it
// shows the current selection (or a muted prompt); open it lists the categories
// with a check on the selected ones. Closes on outside-click / Esc.

interface CategoryDropdownProps {
  value: Category[];
  onToggle: (category: Category) => void;
}

export function CategoryDropdown({ value, onToggle }: CategoryDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // close the dropdown, not the whole panel
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-surface-raised"
      >
        <span className={value.length ? "text-text" : "text-text-muted"}>
          {value.length ? value.join(", ") : "Add category"}
        </span>
        <span className="text-text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-9 z-20 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          {CATEGORIES.map((c) => {
            const selected = value.includes(c);
            return (
              <button
                key={c}
                onClick={() => onToggle(c)}
                className={
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm " +
                  (selected ? "text-text" : "text-text-muted hover:bg-surface hover:text-text")
                }
              >
                <span>{c}</span>
                {selected && <span className="text-accent">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
