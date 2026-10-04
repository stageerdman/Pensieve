import type { NoteMeta } from "../lib/types";
import { activeView, type SidebarState } from "../lib/sidebar/view";
import { arrange } from "../lib/sidebar/arrange";
import { NoteRow } from "./NoteRow";
import { SidebarCustomise } from "./SidebarCustomise";

// The notes list. Ordering/grouping/pinning is derived by the pure arrange() layer
// from the active view; this component only renders the resulting sections and wires
// open/pin/customise. What each row shows is driven by the same view.

interface SidebarProps {
  notes: NoteMeta[];
  state: SidebarState;
  currentId?: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onTogglePin: (id: string) => void;
  onChangeState: (state: SidebarState) => void;
}

export function Sidebar({
  notes,
  state,
  currentId,
  onOpen,
  onNew,
  onTogglePin,
  onChangeState,
}: SidebarProps) {
  const view = activeView(state);
  // One "now" per render so every row's time and the date buckets agree.
  const now = Date.now();
  const sections = arrange(notes, view, now);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-3 py-3">
        <SidebarCustomise state={state} onChange={onChangeState} />
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
