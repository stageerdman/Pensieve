import { useMemo } from "react";
import type { NoteMeta } from "../lib/types";
import type { SidebarView } from "../lib/sidebar/view";
import { arrange } from "../lib/sidebar/arrange";
import { NoteRow } from "./NoteRow";
import { SidebarCustomise } from "./SidebarCustomise";

// The notes list. Ordering/grouping/pinning is derived by the pure arrange() layer
// from the active view; this component only renders the resulting sections and wires
// open/pin/customise. What each row shows is driven by the same view.

interface SidebarProps {
  notes: NoteMeta[];
  view: SidebarView;
  currentId?: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onTogglePin: (id: string) => void;
  onChangeView: (view: SidebarView) => void;
}

export function Sidebar({
  notes,
  view,
  currentId,
  onOpen,
  onNew,
  onTogglePin,
  onChangeView,
}: SidebarProps) {
  // One "now" per render so every row's relative/absolute time and the date buckets
  // agree with each other.
  const now = Date.now();
  const sections = useMemo(() => arrange(notes, view, now), [notes, view, now]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-text-muted">{view.name}</span>
          <SidebarCustomise view={view} onChange={onChangeView} />
        </div>
        <button
          onClick={onNew}
          aria-label="New note"
          title="New note  ⌘N"
          className="rounded px-2 py-0.5 text-lg leading-none text-text-muted hover:bg-surface-raised hover:text-text"
        >
          +
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-1 pb-2">
        {notes.length === 0 && (
          <p className="px-3 py-2 text-sm text-text-muted">No notes yet.</p>
        )}
        {sections.map((section) => (
          <div key={section.key}>
            {section.label && (
              <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
                {section.label}
              </p>
            )}
            {section.notes.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                view={view}
                active={n.id === currentId}
                now={now}
                onOpen={onOpen}
                onTogglePin={onTogglePin}
              />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
