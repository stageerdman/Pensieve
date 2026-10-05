// Core data model. A note is content (Markdown body, the source of truth) plus
// small metadata. User metadata (category / tags / links / icon) is persisted as
// YAML frontmatter in the .md file — see lib/md/frontmatter. Timeline entries are
// disposable history kept beside the note.

import type { NoteIcon } from "./flasks/icon";
export type { NoteIcon } from "./flasks/icon";

/** A category is referenced by NAME in frontmatter — that string is the truth.
 *  The available categories and their colours are defined separately; see
 *  lib/categories (CategoryDef, DEFAULT_CATEGORIES). */
export type Category = string;

export interface NoteMeta {
  id: string; // stable id (also the .md basename in the Tauri vault)
  title: string; // derived from the first line
  createdAt: number; // the note's real creation date — user-editable (see Details)
  addedAt?: number; // when it was actually logged into the app — immutable; the
  // fallback to restore createdAt to. Older notes without it fall back to createdAt.
  updatedAt: number;
  // Surfaced in listings for fast cross-note use (e.g. tag whispering). The .md
  // frontmatter remains the source of truth.
  categories?: Category[];
  tags?: string[];
  // The note's chosen flask icon (shape + colour), surfaced for the sidebar row.
  // Undefined means "not chosen" — the row renders DEFAULT_ICON (see flasks/icon).
  icon?: NoteIcon;
  // Surfaced into the fast-list sidecar so the sidebar can render pin state and a
  // preview without reading note bodies (see lib/sidebar). Not in .md frontmatter.
  pinned?: boolean; // user-pinned to the top of the sidebar
  excerpt?: string; // Markdown-stripped first ~140 chars of the body, for previews
  chars?: number; // non-space content char count (drives the flask fill level)
}

export interface Note extends NoteMeta {
  addedAt: number; // always present on a loaded note (backfilled from createdAt)
  markdown: string; // the body only (no frontmatter) — what the editor edits
  categories: Category[]; // multi-select; empty is a valid resting state
  tags: string[];
  links: string[]; // ids of related notes
  icon?: NoteIcon; // chosen flask; undefined until the owner picks one
  pinned: boolean; // pinned to the top of the sidebar
}

/** The user-editable metadata carried in frontmatter. */
export interface NoteFields {
  categories: Category[];
  tags: string[];
  links: string[];
  icon?: NoteIcon; // optional — only written when the owner has chosen a flask
}

export const EMPTY_FIELDS: NoteFields = { categories: [], tags: [], links: [] };

/** One "addition" — a writing session's worth of change (see timeline.ts). */
export interface TimelineEntry {
  ts: number; // session start
  wordDelta: number; // net words added (may be negative)
  created?: boolean; // true for the very first session of a note
}

/** Storage backend. Implemented by the browser adapter (dev) and Tauri (native). */
export interface Store {
  list(): Promise<NoteMeta[]>;
  load(id: string): Promise<Note | null>;
  save(note: Note): Promise<void>;
  create(): Promise<Note>;
  remove(id: string): Promise<void>;
  // Pin/unpin without touching the body or updatedAt — pinning is not an edit, so
  // it must not reorder a list sorted by update time.
  setPinned(id: string, pinned: boolean): Promise<void>;
  loadTimeline(id: string): Promise<TimelineEntry[]>;
  appendTimeline(id: string, entry: TimelineEntry): Promise<void>;
}
