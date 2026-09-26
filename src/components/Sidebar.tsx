import type { NoteMeta } from "../lib/types";

// Flat, reverse-chronological notes list. Title + faint relative time. Nothing
// else — no folders, tags, counts, or previews (design.md cut list).

interface SidebarProps {
  notes: NoteMeta[];
  currentId?: string;
  onOpen: (id: string) => void;
  onNew: () => void;
}

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

export function Sidebar({ notes, currentId, onOpen, onNew }: SidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium text-text-muted">Notes</span>
        <button
          onClick={onNew}
          aria-label="New note"
          title="New note  ⌘N"
          className="rounded px-2 py-0.5 text-lg leading-none text-text-muted hover:bg-surface-raised hover:text-text"
        >
          +
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto">
        {notes.length === 0 && (
          <p className="px-4 py-2 text-sm text-text-muted">No notes yet.</p>
        )}
        {notes.map((n) => {
          const active = n.id === currentId;
          return (
            <button
              key={n.id}
              onClick={() => onOpen(n.id)}
              className={
                "block w-full truncate px-4 py-2 text-left text-sm " +
                (active
                  ? "bg-surface-raised text-text"
                  : "text-text-muted hover:bg-surface-raised hover:text-text")
              }
            >
              <span className="block truncate">{n.title || "Untitled"}</span>
              <span className="block text-xs text-text-muted/70">
                {relativeTime(n.updatedAt)}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
