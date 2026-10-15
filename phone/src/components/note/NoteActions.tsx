// NoteActions.tsx — the bottom-right action bar for a memory and for the photo collection.
// Follows the phone control standard (UX.md "Phone control standard"): controls live at the
// BOTTOM, never the top. A back button sits next to the gold Spell Menu opener (the same
// SpellMenuButton the home dock uses); the ring blooms UP from it in its Conditional form.

import { SpellMenuButton } from "../dock/SpellMenuButton";

export function NoteActions({
  onBack,
  onOpenMenu,
  backLabel = "Back",
}: {
  onBack: () => void;
  onOpenMenu: () => void;
  backLabel?: string;
}) {
  return (
    <div className="note-actions">
      <button type="button" className="note-actions-back" aria-label={backLabel} onClick={onBack}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </button>
      <SpellMenuButton onOpen={onOpenMenu} />
    </div>
  );
}
