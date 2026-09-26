// Tauri storage adapter — the on-disk vault for the native .app. Same Store
// interface as the browser adapter, so feature code never knows which is active.
// Layout under <appData>/vault/:
//   notes/<id>.md         the note content (source of truth)
//   notes/<id>.meta.json  { title, createdAt, updatedAt }
//   timelines/<id>.json   TimelineEntry[]

import { invoke } from "@tauri-apps/api/core";
import type { Note, NoteMeta, Store, TimelineEntry } from "../types";
import { titleFromMarkdown } from "../text";
import { log } from "../logger";

const readText = (rel: string) => invoke<string | null>("read_text", { rel });
const writeText = (rel: string, contents: string) =>
  invoke<void>("write_text", { rel, contents });
const listDir = (rel: string) => invoke<string[]>("list_dir", { rel });
const removePath = (rel: string) => invoke<void>("remove_path", { rel });

const notePath = (id: string) => `notes/${id}.md`;
const metaPath = (id: string) => `notes/${id}.meta.json`;
const timelinePath = (id: string) => `timelines/${id}.json`;

interface Meta {
  title: string;
  createdAt: number;
  updatedAt: number;
}

function newId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export class TauriStore implements Store {
  async list(): Promise<NoteMeta[]> {
    const files = await listDir("notes");
    const ids = files
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3));
    const metas: NoteMeta[] = [];
    for (const id of ids) {
      const raw = await readText(metaPath(id));
      if (!raw) continue;
      const m = JSON.parse(raw) as Meta;
      metas.push({ id, title: m.title, createdAt: m.createdAt, updatedAt: m.updatedAt });
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt);
    return metas;
  }

  async load(id: string): Promise<Note | null> {
    const md = await readText(notePath(id));
    if (md === null) return null;
    const rawMeta = await readText(metaPath(id));
    const m: Meta = rawMeta
      ? (JSON.parse(rawMeta) as Meta)
      : { title: titleFromMarkdown(md), createdAt: Date.now(), updatedAt: Date.now() };
    return { id, markdown: md, title: m.title, createdAt: m.createdAt, updatedAt: m.updatedAt };
  }

  async save(note: Note): Promise<void> {
    const meta: Meta = {
      title: titleFromMarkdown(note.markdown),
      createdAt: note.createdAt,
      updatedAt: Date.now(),
    };
    await writeText(notePath(note.id), note.markdown);
    await writeText(metaPath(note.id), JSON.stringify(meta));
    log.debug("store", "save", { id: note.id, title: meta.title });
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
    await this.save(note);
    log.info("store", "create", { id: note.id });
    return note;
  }

  async remove(id: string): Promise<void> {
    await removePath(notePath(id));
    await removePath(metaPath(id));
    await removePath(timelinePath(id));
    log.info("store", "remove", { id });
  }

  async loadTimeline(id: string): Promise<TimelineEntry[]> {
    const raw = await readText(timelinePath(id));
    return raw ? (JSON.parse(raw) as TimelineEntry[]) : [];
  }

  async appendTimeline(id: string, entry: TimelineEntry): Promise<void> {
    const list = await this.loadTimeline(id);
    list.push(entry);
    await writeText(timelinePath(id), JSON.stringify(list));
    log.debug("store", "timeline.append", { id, delta: entry.wordDelta });
  }
}
