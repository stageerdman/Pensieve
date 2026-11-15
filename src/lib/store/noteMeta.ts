// FAST-LOAD: patch the in-memory note list instead of relisting the vault. A save, create,
// remove or flag toggle changes exactly one note, so useNotes folds that one change into the
// list it already holds — the same NoteMeta a fresh list() would return for it (derived via
// the same listCache helpers, so the two paths can't drift).

import type { Note, NoteMeta } from "../types";
import { titleFromMarkdown } from "../text";
import { deriveFromBody, toNoteMeta } from "./listCache";

/** The NoteMeta list() would produce for `note` right after it was saved at `updatedAt`.
 *  Sidecar-only engagement signals (openCount/lastOpenedAt) carry over from `prev`. */
export function metaFromNote(note: Note, prev: NoteMeta | undefined, updatedAt: number): NoteMeta {
  return toNoteMeta(
    note.id,
    {
      title: titleFromMarkdown(note.markdown),
      createdAt: note.createdAt,
      addedAt: note.addedAt,
      updatedAt,
      categories: note.categories,
      tags: note.tags,
      pinned: note.pinned,
      starred: note.starred,
      openCount: prev?.openCount,
      lastOpenedAt: prev?.lastOpenedAt,
    },
    deriveFromBody(note.markdown, note),
  );
}

/** Replace the note with the same id, or append it. Returns a new array. */
export function upsertMeta(list: NoteMeta[], meta: NoteMeta): NoteMeta[] {
  const i = list.findIndex((n) => n.id === meta.id);
  if (i === -1) return [...list, meta];
  const next = list.slice();
  next[i] = meta;
  return next;
}

/** The most recently updated note (the one to open at launch / after a delete). */
export function newestNote(list: NoteMeta[]): NoteMeta | undefined {
  let best: NoteMeta | undefined;
  for (const n of list) if (!best || n.updatedAt > best.updatedAt) best = n;
  return best;
}
