import type { ReactNode } from "react";
import type { Note, NoteFields, NoteMeta } from "../lib/types";
import { RightPanel } from "./RightPanel";
import { CategorySelect } from "./CategorySelect";
import { TagEditor } from "./TagEditor";
import { RelationshipList } from "./RelationshipList";

// The right "Details" dock: per-note metadata — category, tags, relationships.
// Hidden by default (toggled from the header). Edits persist immediately via
// updateMeta. Sections are separated by whitespace, each with a quiet micro-label.

interface DetailsPanelProps {
  note: Note;
  notes: NoteMeta[];
  onClose: () => void;
  onOpenNote: (id: string) => void;
  updateMeta: (partial: Partial<NoteFields>) => void;
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

export function DetailsPanel({ note, notes, onClose, onOpenNote, updateMeta }: DetailsPanelProps) {
  return (
    <RightPanel title="Details" onClose={onClose}>
      <div className="space-y-6 pt-1">
        <Section label="Category">
          <CategorySelect value={note.category} onChange={(category) => updateMeta({ category })} />
        </Section>
        <Section label="Tags">
          <TagEditor tags={note.tags} onChange={(tags) => updateMeta({ tags })} />
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
