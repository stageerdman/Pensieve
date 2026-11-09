// ConfirmDeleteRawBatch.tsx — "Delete this batch?", the Raw Memory counterpart to
// ConfirmDeleteNote.tsx. Same contract: the Conditional "Delete" spell never deletes on
// the tap itself, only onConfirm does — and this delete also removes the cloud copy once
// synced (see wiki.md's sync-tombstone decision), which this copy says explicitly.

export interface ConfirmDeleteRawBatchProps {
  pageCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteRawBatch({ pageCount, onCancel, onConfirm }: ConfirmDeleteRawBatchProps) {
  return (
    <div className="ph-confirm-overlay" role="alertdialog" aria-label="Delete this batch?">
      <div className="ph-confirm-card">
        <p className="ph-confirm-title">Delete this batch?</p>
        <p className="ph-confirm-body">
          Removes all {pageCount} page{pageCount === 1 ? "" : "s"} here and the cloud copy, if it already synced.
        </p>
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
