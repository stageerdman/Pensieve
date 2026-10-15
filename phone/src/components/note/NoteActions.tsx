// NoteActions.tsx — the bottom control bar for a memory and for the photo collection.
//
// This is the SAME 4-cell Dock the home screen uses (phone control standard, UX.md): controls
// live at the bottom, in fixed slots — never a floating cluster. The NOTE_DOCK layout places the
// gold Spell-Menu button bottom-right (cell 3) with Back in the slot directly beside it (cell 2).
// The ring blooms UP from the menu button in its Conditional form; Back is a collapsed spell.

import { Dock } from "../dock/Dock";
import { NOTE_DOCK } from "../../lib/spells/dockModel";

export function NoteActions({ onBack, onOpenMenu }: { onBack: () => void; onOpenMenu: () => void }) {
  return <Dock layout={NOTE_DOCK} onOpenMenu={onOpenMenu} onSpell={(id) => id === "back" && onBack()} />;
}
