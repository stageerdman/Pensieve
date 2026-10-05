// Browser storage adapter — localStorage-backed. Used for development, tests, and
// verifying the full writing experience in the browser before the native shell.
// The Tauri adapter (native .app) implements the same Store interface over the
// on-disk .md vault + sidecar timeline files.

import type { Note, NoteMeta, Store, TimelineEntry } from "../types";
import { titleFromMarkdown, excerptFromMarkdown, contentCharCount } from "../text";
import { log } from "../logger";

const NOTE_PREFIX = "pensieve:note:";
const TIMELINE_PREFIX = "pensieve:timeline:";

function newId(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

// Normalise notes read from storage: older notes predate categories/tags/links
// (and used a single `category`), so fill sensible defaults (back-compat).
function readNote(id: string): Note | null {
  const raw = localStorage.getItem(NOTE_PREFIX + id);
  if (!raw) return null;
  const n = JSON.parse(raw) as Partial<Note> & Note & { category?: Note["categories"][number] };
  const categories = n.categories ?? (n.category ? [n.category] : []);
  return {
    ...n,
    categories,
    tags: n.tags ?? [],
    links: n.links ?? [],
    pinned: n.pinned ?? false,
    addedAt: n.addedAt ?? n.createdAt, // back-compat for notes predating addedAt
  };
}

export class BrowserStore implements Store {
  async list(): Promise<NoteMeta[]> {
    const metas: NoteMeta[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(NOTE_PREFIX)) continue;
      const n = readNote(key.slice(NOTE_PREFIX.length))!;
      metas.push({
        id: n.id,
        title: n.title,
        createdAt: n.createdAt,
        addedAt: n.addedAt,
        updatedAt: n.updatedAt,
        categories: n.categories,
        tags: n.tags,
        icon: n.icon,
        pinned: n.pinned,
        excerpt: excerptFromMarkdown(n.markdown),
        chars: contentCharCount(n.markdown),
      });
    }
    // Order is a view concern now (see lib/sidebar/arrange) — return unsorted.
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
      addedAt: now,
      updatedAt: now,
      categories: [],
      tags: [],
      links: [],
      pinned: false,
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

  async setPinned(id: string, pinned: boolean): Promise<void> {
    const note = readNote(id);
    if (!note) return;
    // Write pinned straight to storage — not via save() — so updatedAt is untouched.
    localStorage.setItem(NOTE_PREFIX + id, JSON.stringify({ ...note, pinned }));
    log.debug("store", "pin", { id, pinned });
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
