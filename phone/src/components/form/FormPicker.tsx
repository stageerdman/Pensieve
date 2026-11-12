// FormPicker.tsx — "Which form?" when the phone has more than one (the Form spell goes
// straight in when there's just one). Same sheet language as the confirm popups.

import type { Note } from "../../types";

export function FormPicker({ forms, onPick, onCancel }: { forms: Note[]; onPick: (f: Note) => void; onCancel: () => void }) {
  return (
    <div className="ph-confirm-overlay" role="dialog" aria-label="Choose a form" onClick={onCancel}>
      <div className="ph-confirm-card ph-form-picker" onClick={(e) => e.stopPropagation()}>
        <p className="ph-confirm-title">Which form?</p>
        {forms.map((f) => (
          <button type="button" key={f.id} className="ph-form-pick" onClick={() => onPick(f)}>
            {f.t || "Untitled form"}
          </button>
        ))}
        <div className="ph-confirm-actions">
          <button type="button" className="ph-confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
