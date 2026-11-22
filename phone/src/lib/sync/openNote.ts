// openNote.ts — what to do with the OPEN memory after a sync reloaded the vault (PURE).
//
// A sync writes straight to storage and PhoneApp reloads its vault from there, so every note
// becomes a new object. The open memory must follow: autosave writes onto `currentRef`, and an
// object that is no longer in the vault is never saved again (typing after a sync was lost).
// And if the sync pulled a newer copy (e.g. the computer cast a Patronus spell), the page must
// show it, or the spell keeps saying "Waits for the computer" (PATRONUS-BLOCK UX walk-through).

import type { Note } from "../../types";

export type OpenNoteRefresh =
  /** Nothing to do: not in the vault (a brand-new memory, or removed), or the same object. */
  | { kind: "none" }
  /** Follow the vault's object; the page already shows the right thing. */
  | { kind: "follow"; note: Note }
  /** Follow it and redraw the page from it: the sync brought a different copy. */
  | { kind: "redraw"; note: Note };

/** `shown` is the page as serialized right now. If it differs from the open note, the owner
 *  typed while the sync ran: keep their words on screen (the next autosave writes them onto
 *  the vault's copy) rather than wipe them with the pulled one. */
export function refreshOpenNote(open: Note, vault: Note[], shown: { title: string; content: string }): OpenNoteRefresh {
  const next = vault.find((n) => n.id === open.id);
  if (!next || next === open) return { kind: "none" };
  const typedDuringSync = shown.title !== (open.t ?? "") || shown.content !== (open.c ?? "");
  const same = shown.title === (next.t ?? "") && shown.content === (next.c ?? "");
  return typedDuringSync || same ? { kind: "follow", note: next } : { kind: "redraw", note: next };
}
