import { useMemo } from "react";
import { isFormTemplate, parseForm } from "../../lib/forms";
import type { Note } from "../../lib/types";

// The one quiet line above a memory that speaks for Forms. Today: on a form itself, it
// says it IS a form and how many questions it asks (feedback for "Use as form"). Later
// phases put the "start from a form" offer (empty memory) and charm buttons here, so all
// forms UI over the editor lives in one place.

export function FormStrip({ note }: { note: Note }) {
  const template = isFormTemplate(note.extra);
  const parsed = useMemo(() => (template ? parseForm(note.markdown) : null), [template, note.markdown]);
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
