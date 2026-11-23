// FormSuggestion.tsx — the one-chip row offered above the summon bar while typing
// "fo…/form/forms": tap it and the word becomes the "form:" filter (only forms).
// Mirrors the desktop Summon "Form · type" suggestion (design/form-look.md).
//
// Pointer-down is prevented so the input keeps focus and the keyboard stays up.

import { Flask } from "../Flask";

export function FormSuggestion({ next, onApply }: { next: string; onApply: (q: string) => void }) {
  return (
    <div className="dock-settings" role="group" aria-label="Suggestion">
      <button
        type="button"
        className="dock-chip dock-chip--form"
        aria-label="Show only forms"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onApply(next)}
      >
        <Flask shape="form" cat="--cat-purple" fill={0.6} form className="dock-chip-flask" />
        <span>Form</span>
        <span className="dock-chip-hint">type</span>
      </button>
    </div>
  );
}
