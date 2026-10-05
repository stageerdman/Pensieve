import type { NoteMeta } from "../lib/types";
import { activeView, effectiveGroup, type SidebarState } from "../lib/sidebar/view";
import { arrange } from "../lib/sidebar/arrange";
import type { CategoryDef } from "../lib/categories/defs";
import { colorOf } from "../lib/categories/defs";
import { catFg } from "../lib/categories/palette";
import { NoteRow } from "./NoteRow";
import { SidebarCustomise } from "./SidebarCustomise";
import { Plus } from "./icons";

// The notes list. Ordering/grouping/pinning is derived by the pure arrange() layer
// from the active view; this component only renders the resulting sections and wires
// open/pin/customise. What each row shows is driven by the same view.

interface SidebarProps {
  notes: NoteMeta[];
  state: SidebarState;
  categoryDefs: CategoryDef[];
  currentId?: string;
  onOpen: (id: string, newTab?: boolean) => void;
  onNew: () => void;
  onTogglePin: (id: string) => void;
  onChangeState: (state: SidebarState) => void;
}

export function Sidebar({
  notes,
  state,
  categoryDefs,
  currentId,
  onOpen,
  onNew,
  onTogglePin,
  onChangeState,
}: SidebarProps) {
  const view = activeView(state);
  // One "now" per render so every row's time and the date buckets agree.
  const now = Date.now();
  const sections = arrange(notes, view, now, categoryDefs.map((d) => d.name));
  const catHeaders = effectiveGroup(view) === "category";

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface-sunken">
      {/* Top strip: traffic lights live on the left (native); the ⋯ customise control
          sits on the right, where the + used to be. */}
      <div
        data-tauri-drag-region
        className="flex h-11 shrink-0 items-center justify-end border-b border-border px-3"
      >
        <SidebarCustomise state={state} onChange={onChangeState} />
      </div>

      <nav className="flex-1 overflow-y-auto px-1 pb-2">
        {/* New note is the primary action — a full-width, slim button atop the list. */}
        <button
          onClick={onNew}
          title="New note  ⌘N"
          className="mb-1 mt-1 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm font-medium text-text-muted hover:bg-surface-raised hover:text-text"
        >
          <Plus size={16} />
          New note
        </button>
        {notes.length === 0 && (
          <p className="px-3 py-2 text-sm text-text-muted">No notes yet.</p>
        )}
        {sections.map((section) => {
          const showDot = catHeaders && !!section.label && section.label !== "Pinned";
          return (
            <div key={section.key}>
              {section.label && (
                <p className="flex items-center gap-1.5 px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
                  {showDot && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: catFg(colorOf(section.label, categoryDefs)) }}
                    />
                  )}
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
                  categoryDefs={categoryDefs}
                  onOpen={onOpen}
                  onTogglePin={onTogglePin}
                />
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
