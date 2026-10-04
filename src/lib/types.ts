// Core data model. A note is content (Markdown body, the source of truth) plus
// small metadata. User metadata (category / tags / links) is persisted as YAML
// frontmatter in the .md file — see lib/md/frontmatter. Timeline entries are
// disposable history kept beside the note.

/** The fixed set of note categories (v1). Order is display order. */
export const CATEGORIES = ["Notes & Lessons", "In my mind", "Execution"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface NoteMeta {
  id: string; // stable id (also the .md basename in the Tauri vault)
  title: string; // derived from the first line
  createdAt: number;
  updatedAt: number;
  category?: Category; // unset is a valid resting state
}

export interface Note extends NoteMeta {
  markdown: string; // the body only (no frontmatter) — what the editor edits
  tags: string[];
  links: string[]; // ids of related notes
}

/** The user-editable metadata carried in frontmatter. */
export interface NoteFields {
  category?: Category;
  tags: string[];
  links: string[];
}

export const EMPTY_FIELDS: NoteFields = { category: undefined, tags: [], links: [] };

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
  loadTimeline(id: string): Promise<TimelineEntry[]>;
  appendTimeline(id: string, entry: TimelineEntry): Promise<void>;
}
