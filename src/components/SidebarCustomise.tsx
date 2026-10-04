import { useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";
import { MoreHorizontal } from "./icons";
import type {
  GroupMode,
  SidebarFields,
  SidebarView,
  SortKey,
} from "../lib/sidebar/view";

// The one "Customise" popover for the sidebar: sort, grouping, and which fields each
// row shows — the single home for all sidebar preferences (design.md: no settings
// screen). Changes apply live via onChange; there is no Apply/Save button. Closes on
// outside-click / Esc, matching OverflowMenu.

interface SidebarCustomiseProps {
  view: SidebarView;
  onChange: (view: SidebarView) => void;
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: "updatedAt", label: "Updated" },
  { key: "createdAt", label: "Created" },
  { key: "title", label: "Name" },
];

const GROUPS: { mode: GroupMode; label: string }[] = [
  { mode: "none", label: "None (flat)" },
  { mode: "date", label: "Date" },
  { mode: "category", label: "Category" },
];

const FIELDS: { key: keyof SidebarFields; label: string }[] = [
  { key: "relativeTime", label: "Relative time" },
  { key: "updatedAbs", label: "Updated date" },
  { key: "createdAbs", label: "Created date" },
  { key: "category", label: "Category" },
  { key: "tags", label: "Tags" },
  { key: "preview", label: "Preview line" },
];

export function SidebarCustomise({ view, onChange }: SidebarCustomiseProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
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

  // Clicking the active sort key flips direction; a different key switches to it.
  const chooseSort = (key: SortKey) =>
    onChange(
      view.sortKey === key
        ? { ...view, sortDir: view.sortDir === "asc" ? "desc" : "asc" }
        : { ...view, sortKey: key },
    );

  const setGroup = (group: GroupMode) => onChange({ ...view, group });
  const toggleField = (key: keyof SidebarFields) =>
    onChange({ ...view, fields: { ...view.fields, [key]: !view.fields[key] } });

  return (
    <div ref={ref} className="relative">
      <IconButton
        label="Customise list"
        title="Customise list"
        active={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal />
      </IconButton>

      {open && (
        <div className="absolute left-0 top-9 z-20 w-60 rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
          <Group title="Sort">
            {SORTS.map((s) => {
              const activeSort = view.sortKey === s.key;
              return (
                <Row key={s.key} selected={activeSort} onClick={() => chooseSort(s.key)}>
                  <span className="flex-1">{s.label}</span>
                  {activeSort && (
                    <span className="text-text-muted">
                      {view.sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </Row>
              );
            })}
          </Group>

          <Group title="Group by">
            {GROUPS.map((g) => (
              <Row key={g.mode} selected={view.group === g.mode} onClick={() => setGroup(g.mode)}>
                <span className="flex-1">{g.label}</span>
                {view.group === g.mode && <span className="text-accent">✓</span>}
              </Row>
            ))}
          </Group>

          <Group title="Show on each note">
            {FIELDS.map((field) => {
              const on = view.fields[field.key];
              return (
                <Row key={field.key} selected={on} onClick={() => toggleField(field.key)}>
                  <span className="flex-1">{field.label}</span>
                  <span className={on ? "text-accent" : "text-text-muted/40"}>
                    {on ? "✓" : ""}
                  </span>
                </Row>
              );
            })}
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface " +
        (selected ? "text-text" : "text-text-muted hover:text-text")
      }
    >
      {children}
    </button>
  );
}
