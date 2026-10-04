import { useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";
import { MoreHorizontal, Plus, X } from "./icons";
import {
  activeView,
  type GroupMode,
  type PreviewLines,
  type SidebarFields,
  type SidebarState,
  type SidebarView,
  type SortKey,
} from "../lib/sidebar/view";

// The one "Customise" popover: saved views (switch / rename / save / delete), sort,
// grouping, and which fields each row shows — the single home for all sidebar
// preferences (design.md: no settings screen). Changes apply live; closes on
// outside-click / Esc.

interface SidebarCustomiseProps {
  state: SidebarState;
  onChange: (state: SidebarState) => void;
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
  { key: "relativeUpdated", label: "Updated — relative" },
  { key: "relativeCreated", label: "Created — relative" },
  { key: "updatedAbs", label: "Updated — date" },
  { key: "createdAbs", label: "Created — date" },
  { key: "category", label: "Category" },
  { key: "tags", label: "Tags" },
  { key: "preview", label: "Preview" },
];

const PREVIEW_LINES: PreviewLines[] = [1, 2, 3];

function newId(): string {
  return "v-" + Date.now().toString(36);
}

export function SidebarCustomise({ state, onChange }: SidebarCustomiseProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const view = activeView(state);

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

  // Mutate the active view in place.
  const updateActive = (fn: (v: SidebarView) => SidebarView) =>
    onChange({ ...state, views: state.views.map((v) => (v.id === view.id ? fn(v) : v)) });

  const chooseSort = (key: SortKey) =>
    updateActive((v) =>
      v.sortKey === key
        ? { ...v, sortDir: v.sortDir === "asc" ? "desc" : "asc" }
        : { ...v, sortKey: key },
    );
  const setGroup = (group: GroupMode) => updateActive((v) => ({ ...v, group }));
  const toggleField = (key: keyof SidebarFields) =>
    updateActive((v) => ({ ...v, fields: { ...v.fields, [key]: !v.fields[key] } }));
  const setPreviewLines = (previewLines: PreviewLines) =>
    updateActive((v) => ({ ...v, previewLines }));
  const rename = (name: string) => updateActive((v) => ({ ...v, name }));

  const selectView = (id: string) => onChange({ ...state, activeId: id });
  const saveAsNew = () => {
    const v: SidebarView = { ...view, id: newId(), name: "New view" };
    onChange({ ...state, views: [...state.views, v], activeId: v.id });
  };
  const deleteView = () => {
    const views = state.views.filter((v) => v.id !== view.id);
    onChange({ ...state, views, activeId: views[0].id });
  };
  const canDelete = view.id !== "default" && state.views.length > 1;

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
        <div className="absolute left-0 top-9 z-20 max-h-[75vh] w-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
          <Group title="View">
            <input
              value={view.name}
              onChange={(e) => rename(e.target.value)}
              aria-label="View name"
              className="mb-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text outline-none focus:border-text-muted"
            />
            {state.views.length > 1 &&
              state.views.map((v) => (
                <Row key={v.id} selected={v.id === view.id} onClick={() => selectView(v.id)}>
                  <span className="flex-1 truncate">{v.name || "Untitled view"}</span>
                  {v.id === view.id && <span className="text-accent">✓</span>}
                </Row>
              ))}
            <div className="mt-0.5 flex items-center gap-1">
              <button
                onClick={saveAsNew}
                className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-text-muted hover:bg-surface hover:text-text"
              >
                <Plus size={14} />
                <span>Save as new view</span>
              </button>
              {canDelete && (
                <button
                  onClick={deleteView}
                  aria-label="Delete this view"
                  title="Delete this view"
                  className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-danger"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </Group>

          <Divider />

          <Group title="Sort">
            {SORTS.map((s) => {
              const on = view.sortKey === s.key;
              return (
                <Row key={s.key} selected={on} onClick={() => chooseSort(s.key)}>
                  <span className="flex-1">{s.label}</span>
                  {on && <span className="text-text-muted">{view.sortDir === "asc" ? "↑" : "↓"}</span>}
                </Row>
              );
            })}
          </Group>

          <Divider />

          <Group title="Group by">
            {GROUPS.map((g) => (
              <Row key={g.mode} selected={view.group === g.mode} onClick={() => setGroup(g.mode)}>
                <span className="flex-1">{g.label}</span>
                {view.group === g.mode && <span className="text-accent">✓</span>}
              </Row>
            ))}
          </Group>

          <Divider />

          <Group title="Show on each note">
            {FIELDS.map((field) => {
              const on = view.fields[field.key];
              return (
                <Row key={field.key} selected={on} onClick={() => toggleField(field.key)}>
                  <span className="flex-1">{field.label}</span>
                  <span className={on ? "text-accent" : "text-text-muted/30"}>{on ? "✓" : ""}</span>
                </Row>
              );
            })}
            {view.fields.preview && (
              <div className="mt-1 flex items-center gap-2 px-2 py-1 text-sm text-text-muted">
                <span className="flex-1">Preview lines</span>
                <div className="flex overflow-hidden rounded-md border border-border">
                  {PREVIEW_LINES.map((n) => (
                    <button
                      key={n}
                      onClick={() => setPreviewLines(n)}
                      className={
                        "px-2 py-0.5 text-xs " +
                        (view.previewLines === n
                          ? "bg-accent text-surface"
                          : "text-text-muted hover:bg-surface")
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
        {title}
      </p>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-1.5 border-t border-border" />;
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
