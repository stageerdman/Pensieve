import type { ReactNode } from "react";
import type { Note, NoteFields, NoteMeta } from "../lib/types";
import type { CategoryApi } from "../hooks/useCategoryDefs";
import { RightPanel } from "./RightPanel";
import { CategoryDropdown } from "./CategoryDropdown";
import { TagEditor } from "./TagEditor";
import { RelationshipList } from "./RelationshipList";

// The right "Details" dock: per-note metadata — category, tags, relationships.
// Hidden by default (toggled from the header). Edits persist immediately via
// updateMeta. Sections are separated by whitespace, each with a quiet micro-label.

interface DetailsPanelProps {
  note: Note;
  notes: NoteMeta[];
  tagSuggestions: string[];
  categories: CategoryApi;
  onClose: () => void;
  onOpenNote: (id: string) => void;
  updateMeta: (partial: Partial<NoteFields> | ((note: Note) => Partial<NoteFields>)) => void;
  onSetCreatedAt: (ts: number) => void;
}

// Local YYYY-MM-DD for a date <input> (not toISOString, which is UTC and can shift
// the day across timezones).
function toDateInput(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted/70">
        {label}
      </div>
      {children}
    </div>
  );
}

export function DetailsPanel({
  note,
  notes,
  tagSuggestions,
  categories,
  onClose,
  onOpenNote,
  updateMeta,
  onSetCreatedAt,
}: DetailsPanelProps) {
  // Edit the date only; keep the original time-of-day so ordering within a day holds.
  const onCreatedChange = (value: string) => {
    if (!value) return;
    const [y, m, d] = value.split("-").map(Number);
    const next = new Date(note.createdAt);
    next.setFullYear(y, m - 1, d);
    onSetCreatedAt(next.getTime());
  };

  return (
    <RightPanel title="Details" onClose={onClose}>
      <div className="space-y-6 pt-1">
        <Section label="Category">
          <CategoryDropdown
            value={note.categories}
            defs={categories.defs}
            onToggle={(c) =>
              updateMeta((n) => ({
                categories: n.categories.includes(c)
                  ? n.categories.filter((x) => x !== c)
                  : [...n.categories, c],
              }))
            }
            onAdd={categories.addCategory}
            onSetColor={categories.setColor}
            onRemove={categories.removeCategory}
          />
        </Section>
        <Section label="Tags">
          <TagEditor
            tags={note.tags}
            suggestions={tagSuggestions}
            onChange={(tags) => updateMeta({ tags })}
          />
        </Section>
        <Section label="Created">
          <input
            type="date"
            value={toDateInput(note.createdAt)}
            onChange={(e) => onCreatedChange(e.target.value)}
            aria-label="Creation date"
            className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-text-muted focus:outline-none"
          />
        </Section>
        <Section label="Relationships">
          <RelationshipList
            noteId={note.id}
            links={note.links}
            notes={notes}
            onOpen={onOpenNote}
            onChange={(links) => updateMeta({ links })}
          />
        </Section>
      </div>
    </RightPanel>
  );
}
