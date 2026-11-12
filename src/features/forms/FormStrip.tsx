import { useMemo } from "react";
import { isFormTemplate, parseForm } from "../../lib/forms";
import type { Note, NoteMeta } from "../../lib/types";
import { FormIcon } from "../../components/icons";

// The one quiet line above a memory that speaks for Forms. Today: on a form itself, it
// says it IS a form and how many questions it asks (feedback for "Use as form"). Later
// phases put the "start from a form" offer (empty memory) and charm buttons here, so all
// forms UI over the editor lives in one place.

const isBlank = (md: string) => md.replace(/[\u200B\s]/g, "") === "";

interface Props {
  note: Note;
  /** Every memory, for the forms the empty-memory offer lists. */
  notes: NoteMeta[];
  onStartFrom: (formId: string) => void;
}

export function FormStrip({ note, notes, onStartFrom }: Props) {
  const template = isFormTemplate(note.extra);
  const parsed = useMemo(() => (template ? parseForm(note.markdown) : null), [template, note.markdown]);
  const forms = useMemo(
    () =>
      notes
        .filter((n) => n.id !== note.id && isFormTemplate(n.extra))
        .sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    [notes, note.id],
  );

  // An empty memory offers your forms. The offer is just the memory's empty state: the
  // first keystroke makes the memory non-empty and it's gone.
  if (!template && isBlank(note.markdown) && forms.length) {
    return (
      <div className="mx-auto mb-2 flex max-w-[72ch] flex-wrap items-center gap-1.5" data-testid="form-offer">
        <span className="mr-1 text-xs text-text-muted">Start from</span>
        {forms.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onStartFrom(f.id)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm text-text hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <FormIcon size={14} />
            {f.title || "Untitled form"}
          </button>
        ))}
      </div>
    );
  }

  if (!template || !parsed) return null;

  const q = parsed.fields.length;
  const c = parsed.charms.length;
  return (
    // Width matches the editor column (72ch at body size) — the small type lives on the
    // children, or `ch` would shrink with it and pull the strip off-centre.
    <div className="mx-auto mb-2 flex max-w-[72ch] items-center gap-2" data-testid="form-strip">
      <span className="rounded-sm bg-surface-raised px-1.5 py-0.5 text-xs font-medium text-text">Form</span>
      <span className="text-xs text-text-muted">
        {q === 0
          ? "Write a bold line to ask a question."
          : `${q} question${q === 1 ? "" : "s"}${c ? ` · ${c} charm${c === 1 ? "" : "s"}` : ""} · new memories offer it`}
      </span>
    </div>
  );
}
