// Tauri storage adapter — the on-disk vault for the native .app. Same Store
// interface as the browser adapter, so feature code never knows which is active.
// Layout under <appData>/vault/:
//   notes/<id>.md         frontmatter (category/tags/links) + Markdown body — truth
//   notes/<id>.meta.json  { title, createdAt, updatedAt } — system fields, fast list
//   timelines/<id>.json   TimelineEntry[]

import { invoke } from "@tauri-apps/api/core";
import type { Category, Note, NoteMeta, Store, TimelineEntry } from "../types";
import { titleFromMarkdown, excerptFromMarkdown } from "../text";
import { parseFrontmatter, composeFrontmatter } from "../md/frontmatter";
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
  // Mirrored from the frontmatter for fast listing (whispering, filters). The
  // .md frontmatter stays the source of truth.
  categories?: Category[];
  tags?: string[];
  // Pin state lives in the fast-list sidecar so setPinned can toggle it without
  // rewriting the .md. (The preview excerpt is computed live in list(), not stored.)
  pinned?: boolean;
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
      // Compute the preview excerpt fresh from the body so it always reflects the
      // current stripping rules (stored excerpts could be stale). One extra small
      // file read per note — fine at personal-vault scale.
      const file = await readText(notePath(id));
      const excerpt = file ? excerptFromMarkdown(parseFrontmatter(file).body) : "";
      metas.push({
        id,
        title: m.title,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        categories: m.categories ?? [],
        tags: m.tags ?? [],
        pinned: m.pinned ?? false,
        excerpt,
      });
    }
    // Order is a view concern now (see lib/sidebar/arrange) — return unsorted.
    return metas;
  }

  async load(id: string): Promise<Note | null> {
    const raw = await readText(notePath(id));
    if (raw === null) return null;
    const { fields, body } = parseFrontmatter(raw);
    const rawMeta = await readText(metaPath(id));
    const m: Meta = rawMeta
      ? (JSON.parse(rawMeta) as Meta)
      : { title: titleFromMarkdown(body), createdAt: Date.now(), updatedAt: Date.now() };
    return {
      id,
      markdown: body,
      title: m.title,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      categories: fields.categories,
      tags: fields.tags,
      links: fields.links,
      pinned: m.pinned ?? false,
    };
  }

  async save(note: Note): Promise<void> {
    const meta: Meta = {
      title: titleFromMarkdown(note.markdown),
      createdAt: note.createdAt,
      updatedAt: Date.now(),
      categories: note.categories,
      tags: note.tags,
      pinned: note.pinned,
    };
    const file = composeFrontmatter(
      { categories: note.categories, tags: note.tags, links: note.links },
      note.markdown,
    );
    await writeText(notePath(note.id), file);
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
      categories: [],
      tags: [],
      links: [],
      pinned: false,
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

  async setPinned(id: string, pinned: boolean): Promise<void> {
    // Pin state lives only in the sidecar — rewrite .meta.json, leave the .md and
    // updatedAt untouched so pinning never reorders an update-sorted list.
    const raw = await readText(metaPath(id));
    if (!raw) return;
    const m = JSON.parse(raw) as Meta;
    await writeText(metaPath(id), JSON.stringify({ ...m, pinned }));
    log.debug("store", "pin", { id, pinned });
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
