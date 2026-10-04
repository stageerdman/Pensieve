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
}: DetailsPanelProps) {
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
