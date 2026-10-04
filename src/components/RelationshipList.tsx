import { useMemo, useState } from "react";
import type { NoteMeta } from "../lib/types";
import { Plus, X } from "./icons";

// Relationships = links to other notes. List linked notes (click opens, X unlinks),
// and a "Link a note" affordance that reveals a small inline search over the rest.
// Links are stored as note ids; titles are resolved from the notes list.

interface RelationshipListProps {
  noteId: string;
  links: string[];
  notes: NoteMeta[];
  onOpen: (id: string) => void;
  onChange: (next: string[]) => void;
}

export function RelationshipList({ noteId, links, notes, onOpen, onChange }: RelationshipListProps) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const linked = links.map((id) => byId.get(id)).filter(Boolean) as NoteMeta[];

  const candidates = notes.filter(
    (n) =>
      n.id !== noteId &&
      !links.includes(n.id) &&
      (n.title || "Untitled").toLowerCase().includes(query.toLowerCase()),
  );

  const link = (id: string) => {
    onChange([...links, id]);
    setQuery("");
    setAdding(false);
  };

  return (
    <div className="space-y-1">
      {linked.length === 0 && !adding && (
        <p className="text-sm text-text-muted">No links yet</p>
      )}

      {linked.map((n) => (
        <div key={n.id} className="group flex items-center justify-between gap-2">
          <button
            onClick={() => onOpen(n.id)}
            className="truncate text-left text-sm text-text hover:text-accent"
          >
            {n.title || "Untitled"}
          </button>
          <button
            onClick={() => onChange(links.filter((id) => id !== n.id))}
            aria-label="Unlink note"
            className="text-text-muted hover:text-text"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="pt-1">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAdding(false);
                setQuery("");
              } else if (e.key === "Enter" && candidates[0]) {
                link(candidates[0].id);
              }
            }}
            placeholder="Search notes…"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent py-0.5 text-sm text-text placeholder:text-text-muted focus:outline-none"
          />
          <div className="mt-1 max-h-40 overflow-y-auto">
            {candidates.length === 0 && (
              <p className="px-1 py-1 text-xs text-text-muted">No matches</p>
            )}
            {candidates.slice(0, 8).map((n) => (
              <button
                key={n.id}
                onClick={() => link(n.id)}
                className="block w-full truncate rounded px-1 py-1 text-left text-sm text-text-muted hover:bg-surface-raised hover:text-text"
              >
                {n.title || "Untitled"}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-1 flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <Plus size={14} />
          Link a note
        </button>
      )}
    </div>
  );
}
