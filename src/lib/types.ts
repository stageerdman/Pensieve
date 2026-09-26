// Core data model. A note is content (Markdown, the source of truth) plus small
// metadata. Timeline entries are disposable history kept beside the note.

export interface NoteMeta {
  id: string; // stable id (also the .md basename in the Tauri vault)
  title: string; // derived from the first line
  createdAt: number;
  updatedAt: number;
}

export interface Note extends NoteMeta {
  markdown: string;
}

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
