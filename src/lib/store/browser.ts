// Browser storage adapter — localStorage-backed. Used for development, tests, and
// verifying the full writing experience in the browser before the native shell.
// The Tauri adapter (native .app) implements the same Store interface over the
// on-disk .md vault + sidecar timeline files.

import type { Note, NoteMeta, Store, TimelineEntry } from "../types";
import { titleFromMarkdown } from "../text";
import { log } from "../logger";

const NOTE_PREFIX = "pensieve:note:";
const TIMELINE_PREFIX = "pensieve:timeline:";

function newId(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

interface StoredNote extends Note {}

function readNote(id: string): StoredNote | null {
  const raw = localStorage.getItem(NOTE_PREFIX + id);
  return raw ? (JSON.parse(raw) as StoredNote) : null;
}

export class BrowserStore implements Store {
  async list(): Promise<NoteMeta[]> {
    const metas: NoteMeta[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(NOTE_PREFIX)) continue;
      const n = JSON.parse(localStorage.getItem(key)!) as StoredNote;
      metas.push({
        id: n.id,
        title: n.title,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      });
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt);
    return metas;
  }

  async load(id: string): Promise<Note | null> {
    return readNote(id);
  }

  async save(note: Note): Promise<void> {
    const updated: Note = {
      ...note,
      title: titleFromMarkdown(note.markdown),
      updatedAt: Date.now(),
    };
    localStorage.setItem(NOTE_PREFIX + note.id, JSON.stringify(updated));
    log.debug("store", "save", { id: note.id, title: updated.title });
  }

  async create(): Promise<Note> {
    const now = Date.now();
    const note: Note = {
      id: newId(),
      title: "Untitled",
      markdown: "",
      createdAt: now,
      updatedAt: now,
    };
    localStorage.setItem(NOTE_PREFIX + note.id, JSON.stringify(note));
    log.info("store", "create", { id: note.id });
    return note;
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(NOTE_PREFIX + id);
    localStorage.removeItem(TIMELINE_PREFIX + id);
    log.info("store", "remove", { id });
  }

  async loadTimeline(id: string): Promise<TimelineEntry[]> {
    const raw = localStorage.getItem(TIMELINE_PREFIX + id);
    return raw ? (JSON.parse(raw) as TimelineEntry[]) : [];
  }

  async appendTimeline(id: string, entry: TimelineEntry): Promise<void> {
    const list = await this.loadTimeline(id);
    list.push(entry);
    localStorage.setItem(TIMELINE_PREFIX + id, JSON.stringify(list));
    log.debug("store", "timeline.append", { id, delta: entry.wordDelta });
  }
}
