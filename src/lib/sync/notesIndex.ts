// notesIndex.ts — the tiny catalogue of EVERY memory that the desktop publishes to
// OneDrive (`<root>/notes-index.json`) so the phone can keep only a rolling window of
// memories locally yet still find any of them (Accio by title → fetched on tap) and know
// which ones were opened at the computer recently (PHONE-WINDOW update).
//
// Format is a contract with phone/src/lib/sync/window.ts — change both together.
// Short keys on purpose: ~2,000 entries, re-uploaded whenever it changes.

import { isFormTemplate } from "../forms/meta";

export const NOTES_INDEX_NAME = "notes-index.json";
export const NOTES_INDEX_VERSION = 1;

export interface NotesIndexEntry {
  /** Note id (= `<id>.md` on the remote). */
  id: string;
  /** Title. */
  t: string;
  /** createdAt, epoch ms. */
  c: number;
  /** updatedAt, epoch ms. */
  u: number;
  /** lastOpenedAt on the desktop, epoch ms (absent = never opened there). */
  o?: number;
  /** First category, for the phone's flask colour. */
  k?: string;
  /** 1 = a Form template. The phone keeps every form (whatever its age) so any form
   *  can always be started there. */
  f?: 1;
}

export interface NotesIndex {
  v: number;
  notes: NotesIndexEntry[];
}

/** Stable serialization (sorted by id) so an unchanged vault yields identical bytes and
 *  the engine can skip the upload. */
export function serializeNotesIndex(entries: NotesIndexEntry[]): string {
  const notes = [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({ v: NOTES_INDEX_VERSION, notes } satisfies NotesIndex);
}

/** Cheap, stable string hash (FNV-1a 32) — only to detect "changed since last upload". */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ":" + s.length;
}

export interface IndexableMeta {
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  lastOpenedAt?: number;
  categories?: string[];
  /** Unmodelled frontmatter keys — where the form flag lives. */
  extra?: Record<string, string>;
}

/** One note's listing meta → an index entry (pure; the vault supplies the metas). */
export function indexEntryFromMeta(id: string, meta: IndexableMeta | null): NotesIndexEntry {
  const e: NotesIndexEntry = { id, t: meta?.title ?? "", c: meta?.createdAt ?? 0, u: meta?.updatedAt ?? 0 };
  if (meta?.lastOpenedAt) e.o = meta.lastOpenedAt;
  if (meta?.categories?.[0]) e.k = meta.categories[0];
  if (isFormTemplate(meta?.extra)) e.f = 1;
  return e;
}
