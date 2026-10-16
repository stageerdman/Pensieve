// Browser storage adapter — localStorage-backed. Used for development, tests, and
// verifying the full writing experience in the browser before the native shell.
// The Tauri adapter (native .app) implements the same Store interface over the
// on-disk .md vault + sidecar timeline files.

import type { Note, NoteBody, NoteMeta, Store, TimelineEntry } from "../types";
import { titleFromMarkdown, excerptFromMarkdown, contentCharCount, plainTextFromMarkdown } from "../text";
import { pruneToRecentDays } from "../timeline";
import { log } from "../logger";
import { newMediaId, mediaRef } from "../media";
import { createIdbMediaStore, type MediaBlobStore } from "./idb";

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
  // Media bytes live in IndexedDB (never base64 in localStorage). Injectable so tests can
  // pass an in-memory implementation (jsdom has no IndexedDB).
  constructor(private media: MediaBlobStore = createIdbMediaStore()) {}

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
        openCount: n.openCount ?? 0,
        lastOpenedAt: n.lastOpenedAt,
        links: n.links,
        excerpt: excerptFromMarkdown(n.markdown),
        chars: contentCharCount(n.markdown),
      });
    }
    // Order is a view concern now (see lib/sidebar/arrange) — return unsorted.
    return metas;
  }

  async bodies(): Promise<NoteBody[]> {
    const out: NoteBody[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(NOTE_PREFIX)) continue;
      const n = readNote(key.slice(NOTE_PREFIX.length))!;
      out.push({ id: n.id, text: plainTextFromMarkdown(n.markdown) });
    }
    return out;
  }

  async load(id: string): Promise<Note | null> {
    return readNote(id);
  }

  async save(note: Note): Promise<void> {
    // Preserve engagement signals from the stored copy: markOpened writes them straight to
    // storage out-of-band, so the in-memory note may hold a stale openCount — read-merge so
    // a save never rolls the tally back (mirrors the Tauri sidecar behaviour).
    const prev = readNote(note.id);
    const updated: Note = {
      ...note,
      title: titleFromMarkdown(note.markdown),
      updatedAt: Date.now(),
      openCount: prev?.openCount ?? note.openCount,
      lastOpenedAt: prev?.lastOpenedAt ?? note.lastOpenedAt,
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

  async markOpened(id: string): Promise<void> {
    const note = readNote(id);
    if (!note) return;
    // Write straight to storage — not via save() — so updatedAt stays untouched; opening
    // a memory is not an edit and must not reorder an update-sorted view.
    const openCount = (note.openCount ?? 0) + 1;
    localStorage.setItem(
      NOTE_PREFIX + id,
      JSON.stringify({ ...note, openCount, lastOpenedAt: Date.now() }),
    );
    log.debug("store", "open", { id, openCount });
  }

  async loadTimeline(id: string): Promise<TimelineEntry[]> {
    const raw = localStorage.getItem(TIMELINE_PREFIX + id);
    return raw ? (JSON.parse(raw) as TimelineEntry[]) : [];
  }

  async appendTimeline(id: string, entry: TimelineEntry): Promise<void> {
    const list = pruneToRecentDays([...(await this.loadTimeline(id)), entry]);
    localStorage.setItem(TIMELINE_PREFIX + id, JSON.stringify(list));
    log.debug("store", "timeline.append", { id, delta: entry.wordDelta, kept: list.length });
  }

  async saveTimeline(id: string, entries: TimelineEntry[]): Promise<void> {
    localStorage.setItem(TIMELINE_PREFIX + id, JSON.stringify(entries));
    log.debug("store", "timeline.save", { id, count: entries.length });
  }

  async saveMedia(noteId: string, bytes: Uint8Array | ArrayBuffer, ext: string): Promise<string> {
    const ref = mediaRef(noteId, newMediaId(), ext);
    try {
      // Uint8Array | ArrayBuffer are both valid BlobParts at runtime; the cast sidesteps
      // the ArrayBufferLike/SharedArrayBuffer generic noise in lib.dom.
      await this.media.put(ref, new Blob([bytes as BlobPart]));
      log.info("media", "save", { noteId, ref, bytes: bytes.byteLength });
      return ref;
    } catch (e) {
      log.error("media", "save.error", { noteId, ref, error: String(e) });
      throw e;
    }
  }

  async listMedia(): Promise<string[]> {
    return this.media.keys();
  }

  async loadMediaUrl(ref: string): Promise<string | null> {
    const blob = await this.media.get(ref);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  async removeMedia(ref: string): Promise<void> {
    await this.media.delete(ref);
    log.info("media", "remove", { ref });
  }
}
