// ConfirmDeleteNote.tsx — the "Delete this memory?" confirm/cancel popup.
//
// The Conditional "Delete" spell never deletes on the tap itself — it opens this popup, and
// only onConfirm actually removes the memory. Presentational only; PhoneApp owns the decision.

export interface ConfirmDeleteNoteProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteNote({ onCancel, onConfirm }: ConfirmDeleteNoteProps) {
  return (
    <div className="ph-confirm-overlay" role="alertdialog" aria-label="Delete this memory?">
      <div className="ph-confirm-card">
        <p className="ph-confirm-title">Delete this memory?</p>
        <p className="ph-confirm-body">This can't be undone.</p>
        <div className="ph-confirm-actions">
          <button type="button" className="ph-confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ph-confirm-delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
