import { useEffect, useRef, useState } from "react";
import type { CategoryDef } from "../lib/categories/defs";
import { colorOf } from "../lib/categories/defs";
import { CATEGORY_COLORS, catBg, catFg, type CategoryColor } from "../lib/categories/palette";
import { MoreHorizontal, Trash } from "./icons";

// Category as a multi-select dropdown over the user's categories. A note can have
// several. Beyond toggling, the owner can add a category (inline), and per category
// (on hover, via ⋯) change its colour or delete it. Categories a note references but
// that have no definition yet (orphans) appear too and can be adopted by picking a
// colour. Closes on outside-click / Esc (manage popover first, then the dropdown).

interface CategoryDropdownProps {
  value: string[];
  defs: CategoryDef[];
  onToggle: (name: string) => void;
  onAdd: (name: string) => void;
  onSetColor: (name: string, color: CategoryColor) => void;
  onRemove: (name: string) => void;
}

export function CategoryDropdown({
  value,
  defs,
  onToggle,
  onAdd,
  onSetColor,
  onRemove,
}: CategoryDropdownProps) {
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setManaging(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (managing) setManaging(null);
        else setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, managing]);

  // Rows = defined categories, then any names on this note that aren't defined yet.
  const definedNames = defs.map((d) => d.name);
  const orphans = value.filter((v) => !definedNames.includes(v));
  const rows = [...definedNames, ...orphans];

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    onAdd(name);
    if (!value.includes(name)) onToggle(name);
    setNewName("");
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-surface-raised"
      >
        {value.length ? (
          <span className="flex flex-wrap gap-1">
            {value.map((c) => (
              <span
                key={c}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: catBg(colorOf(c, defs)), color: catFg(colorOf(c, defs)) }}
              >
                {c}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-text-muted">Add category</span>
        )}
        <span className="text-text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-9 z-20 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          {rows.map((name) => {
            const color = colorOf(name, defs);
            const selected = value.includes(name);
            const defined = definedNames.includes(name);
            return (
              <div key={name} className="group relative flex items-center">
                <button
                  onClick={() => onToggle(name)}
                  className={
                    "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm " +
                    (selected ? "text-text" : "text-text-muted hover:text-text")
                  }
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: catFg(color) }}
                  />
                  <span className="flex-1 truncate">{name}</span>
                  {!defined && <span className="text-xs text-text-muted/60">undefined</span>}
                  {selected && <span className="text-accent">✓</span>}
                </button>
                <button
                  onClick={() => setManaging((m) => (m === name ? null : name))}
                  aria-label="Edit category"
                  className="mr-1 shrink-0 rounded p-1 text-text-muted opacity-0 hover:bg-surface hover:text-text group-hover:opacity-100"
                >
                  <MoreHorizontal size={14} />
                </button>

                {managing === name && (
                  <div className="absolute right-1 top-9 z-30 w-44 rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
                    <div className="grid grid-cols-5 gap-1.5">
                      {CATEGORY_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            onSetColor(name, c);
                            setManaging(null);
                          }}
                          aria-label={`Colour ${c}`}
                          className={
                            "h-5 w-5 rounded-full " + (color === c ? "ring-2 ring-text" : "")
                          }
                          style={{ background: catFg(c) }}
                        />
                      ))}
                    </div>
                    {defined && (
                      <button
                        onClick={() => {
                          onRemove(name);
                          setManaging(null);
                        }}
                        className="mt-2 flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-text-muted hover:bg-surface hover:text-danger"
                      >
                        <Trash size={14} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mt-0.5 border-t border-border pt-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
                else if (e.key === "Escape") {
                  e.stopPropagation();
                  setNewName("");
                }
              }}
              placeholder="＋ New category"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
