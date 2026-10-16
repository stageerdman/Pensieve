// Core data model. A note is content (Markdown body, the source of truth) plus
// small metadata. User metadata (category / tags / links / icon) is persisted as
// YAML frontmatter in the .md file — see lib/md/frontmatter. Timeline entries are
// disposable history kept beside the note.

import type { NoteIcon } from "./flasks/icon";
export type { NoteIcon } from "./flasks/icon";
import type { Transcript } from "./transcripts/types";

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
  // --- Engagement signals (for future search ranking; not shown in the UI yet) ---
  // How many times this memory has been deliberately opened. A running tally kept in the
  // fast-list sidecar (never in .md frontmatter) so it survives saves and never touches
  // updatedAt — exactly like `pinned`.
  openCount?: number;
  lastOpenedAt?: number; // when it was last deliberately opened
  // The ids this note links to (surfaced from frontmatter so backlinks are computable
  // without loading every body). The .md frontmatter stays the source of truth.
  links?: string[];
  // How many OTHER memories link to this one. Derived live from every note's `links`
  // (see useNotes) — not persisted, so it is always correct and needs no migration.
  linkedByCount?: number;
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

/** One "addition" — a writing session's worth of change (see timeline.ts). Each
 *  entry is also a restorable **version**: `markdown` is the note body as it stood
 *  at the end of that session. Snapshots are body-only; metadata is not versioned.
 *  `markdown` is optional for back-compat — entries recorded before versioning have
 *  none and simply can't be restored (they still show as history moments). */
export interface TimelineEntry {
  ts: number; // session start
  wordDelta: number; // net words added (may be negative)
  created?: boolean; // true for the very first session of a note
  markdown?: string; // snapshot of the body at session close — the restorable version
}

/** Storage backend. Implemented by the browser adapter (dev) and Tauri (native). */
/** A note's full plain-text body, for building the search index. */
export interface NoteBody {
  id: string;
  text: string; // Markdown-stripped full body (see text.plainTextFromMarkdown)
}

export interface Store {
  list(): Promise<NoteMeta[]>;
  // All note bodies as stripped plain text, for the full-text search index. Separate
  // from list() so the (larger) body text is only pulled when search needs it.
  bodies(): Promise<NoteBody[]>;
  load(id: string): Promise<Note | null>;
  save(note: Note): Promise<void>;
  create(): Promise<Note>;
  remove(id: string): Promise<void>;
  // Pin/unpin without touching the body or updatedAt — pinning is not an edit, so
  // it must not reorder a list sorted by update time.
  setPinned(id: string, pinned: boolean): Promise<void>;
  // Record one deliberate open: bump openCount and stamp lastOpenedAt in the sidecar,
  // without touching the body or updatedAt (opening is not an edit).
  markOpened(id: string): Promise<void>;
  loadTimeline(id: string): Promise<TimelineEntry[]>;
  // Append one session's entry. The adapter prunes the stored history to the most
  // recent edit-days (see timeline.pruneToRecentDays) so it can never grow unbounded.
  appendTimeline(id: string, entry: TimelineEntry): Promise<void>;
  // Replace a note's whole timeline (used by Restore to truncate forward history).
  saveTimeline(id: string, entries: TimelineEntry[]): Promise<void>;

  // --- Media (images now; audio/video later) ---------------------------------------
  // Byte persistence for inline media. Bytes are stored at the vault-relative path
  // `media/<noteId>/<mediaId>.<ext>` (Tauri: on disk; browser: IndexedDB). The .md keeps
  // that ref; it's rewritten to a loadable URL at load (see lib/media/url).

  // Mint a mediaId, write the bytes, and return the vault-relative ref string.
  saveMedia(noteId: string, bytes: Uint8Array | ArrayBuffer, ext: string): Promise<string>;
  // Every media ref currently stored (`media/<noteId>/<mediaId>.<ext>`) — powers the
  // "reuse an already-uploaded image" library picker. Order is unspecified.
  listMedia(): Promise<string[]>;
  // Resolve a ref to a URL the webview can load (Tauri asset URL / browser blob URL), or
  // null if the file is missing.
  loadMediaUrl(ref: string): Promise<string | null>;
  // Remove a media file. NOTE: callers must NOT auto-GC media on block removal this
  // update — version/timeline snapshots may still reference it. Use only for explicit
  // deletions (e.g. deleting a whole note, or a deliberate replace).
  removeMedia(ref: string): Promise<void>;

  // --- Transcripts (sidecars keyed off an audio ref) --------------------------------
  // A transcript lives beside its audio at `<audioRef>.transcript.json` — NOT in the .md.
  // Loaded when the audio is referenced; its text is folded into the search corpus
  // (bodies()) so spoken words are findable in Accio.
  loadTranscript(audioRef: string): Promise<Transcript | null>;
  saveTranscript(audioRef: string, transcript: Transcript): Promise<void>;
}
