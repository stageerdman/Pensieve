// Tauri storage adapter — the on-disk vault for the native .app. Same Store
// interface as the browser adapter, so feature code never knows which is active.
// Layout under <appData>/vault/:
//   notes/<id>.md         frontmatter (category/tags/links) + Markdown body — truth
//   notes/<id>.meta.json  { title, createdAt, updatedAt } — system fields, fast list
//   timelines/<id>.json   TimelineEntry[]

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import type { Category, Note, NoteBody, NoteMeta, Store, TimelineEntry } from "../types";
import { titleFromMarkdown, excerptFromMarkdown, contentCharCount } from "../text";
import { parseFrontmatter, composeFrontmatter } from "../md/frontmatter";
import { pruneToRecentDays } from "../timeline";
import { log } from "../logger";
import { newMediaId, mediaRef, bytesToBase64 } from "../media";
import { buildSearchBody } from "../search/searchBody";
import { transcriptRefFor, parseTranscript } from "../transcripts/transcript";
import type { Transcript } from "../transcripts/types";

const readText = (rel: string) => invoke<string | null>("read_text", { rel });
const writeText = (rel: string, contents: string) =>
  invoke<void>("write_text", { rel, contents });
const writeBytes = (rel: string, data: string) =>
  invoke<void>("write_bytes", { rel, data });
const listDir = (rel: string) => invoke<string[]>("list_dir", { rel });
const removePath = (rel: string) => invoke<void>("remove_path", { rel });

// The vault root is <appData>/vault/ (mirrors vault_root() in src-tauri/src/lib.rs). A
// media ref is vault-relative; the asset protocol needs an absolute path. Resolved once
// and cached — the app data dir never changes within a run.
let vaultAbsRoot: string | null = null;
async function vaultRoot(): Promise<string> {
  if (vaultAbsRoot === null) {
    const base = await appDataDir();
    vaultAbsRoot = base.endsWith("/") ? base + "vault" : base + "/vault";
  }
  return vaultAbsRoot;
}

const notePath = (id: string) => `notes/${id}.md`;
const metaPath = (id: string) => `notes/${id}.meta.json`;
const timelinePath = (id: string) => `timelines/${id}.json`;

interface Meta {
  title: string;
  createdAt: number;
  addedAt?: number; // immutable original log time; back-compat: falls back to createdAt
  updatedAt: number;
  // Mirrored from the frontmatter for fast listing (whispering, filters). The
  // .md frontmatter stays the source of truth.
  categories?: Category[];
  tags?: string[];
  // Pin state lives in the fast-list sidecar so setPinned can toggle it without
  // rewriting the .md. (The preview excerpt is computed live in list(), not stored.)
  pinned?: boolean;
  // Engagement signals — sidecar-only (never .md), bumped by markOpened and preserved
  // across saves. See NoteMeta.openCount.
  openCount?: number;
  lastOpenedAt?: number;
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
      // file read per note — fine at personal-vault scale. The frontmatter is the
      // truth for the flask icon, so read it from here (parse once).
      const file = await readText(notePath(id));
      const parsed = file ? parseFrontmatter(file) : null;
      const excerpt = parsed ? excerptFromMarkdown(parsed.body) : "";
      const chars = parsed ? contentCharCount(parsed.body) : 0;
      metas.push({
        id,
        title: m.title,
        createdAt: m.createdAt,
        addedAt: m.addedAt ?? m.createdAt,
        updatedAt: m.updatedAt,
        categories: m.categories ?? [],
        tags: m.tags ?? [],
        icon: parsed?.fields.icon,
        pinned: m.pinned ?? false,
        openCount: m.openCount ?? 0,
        lastOpenedAt: m.lastOpenedAt,
        links: parsed?.fields.links ?? [],
        excerpt,
        chars,
      });
    }
    // Order is a view concern now (see lib/sidebar/arrange) — return unsorted.
    return metas;
  }

  async bodies(): Promise<NoteBody[]> {
    const files = await listDir("notes");
    const ids = files.filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
    const out: NoteBody[] = [];
    for (const id of ids) {
      const file = await readText(notePath(id));
      if (!file) continue;
      const { body } = parseFrontmatter(file);
      // Markdown + folded transcript sidecars (shared with the single-note reindex path) so
      // spoken words are findable in Accio (transcripts are sidecars, not in the .md).
      const text = await buildSearchBody(body, (ref) => this.loadTranscript(ref));
      out.push({ id, text });
    }
    log.debug("search", "bodies.read", { count: out.length });
    return out;
  }

  async loadTranscript(audioRef: string): Promise<Transcript | null> {
    const raw = await readText(transcriptRefFor(audioRef));
    return raw ? parseTranscript(raw) : null;
  }

  async saveTranscript(audioRef: string, transcript: Transcript): Promise<void> {
    await writeText(transcriptRefFor(audioRef), JSON.stringify(transcript));
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
      addedAt: m.addedAt ?? m.createdAt,
      updatedAt: m.updatedAt,
      categories: fields.categories,
      tags: fields.tags,
      links: fields.links,
      icon: fields.icon,
      pinned: m.pinned ?? false,
    };
  }

  async save(note: Note): Promise<void> {
    // Preserve sidecar-only engagement signals (openCount/lastOpenedAt): they are bumped
    // out-of-band by markOpened and are NOT carried on the note, so read the prior sidecar
    // and carry them forward — a save must never clobber the running open tally.
    const prevRaw = await readText(metaPath(note.id));
    const prev = prevRaw ? (JSON.parse(prevRaw) as Meta) : null;
    const meta: Meta = {
      title: titleFromMarkdown(note.markdown),
      createdAt: note.createdAt,
      addedAt: note.addedAt ?? note.createdAt, // immutable — never reset to now
      updatedAt: Date.now(),
      categories: note.categories,
      tags: note.tags,
      pinned: note.pinned,
      openCount: prev?.openCount,
      lastOpenedAt: prev?.lastOpenedAt,
    };
    const file = composeFrontmatter(
      { categories: note.categories, tags: note.tags, links: note.links, icon: note.icon },
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
      addedAt: now,
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

  async markOpened(id: string): Promise<void> {
    // Bump the open tally in the sidecar only — leave the .md and updatedAt untouched so
    // opening a memory never reorders an update-sorted view.
    const raw = await readText(metaPath(id));
    if (!raw) return;
    const m = JSON.parse(raw) as Meta;
    const openCount = (m.openCount ?? 0) + 1;
    await writeText(metaPath(id), JSON.stringify({ ...m, openCount, lastOpenedAt: Date.now() }));
    log.debug("store", "open", { id, openCount });
  }

  async loadTimeline(id: string): Promise<TimelineEntry[]> {
    const raw = await readText(timelinePath(id));
    return raw ? (JSON.parse(raw) as TimelineEntry[]) : [];
  }

  async appendTimeline(id: string, entry: TimelineEntry): Promise<void> {
    const list = pruneToRecentDays([...(await this.loadTimeline(id)), entry]);
    await writeText(timelinePath(id), JSON.stringify(list));
    log.debug("store", "timeline.append", { id, delta: entry.wordDelta, kept: list.length });
  }

  async saveTimeline(id: string, entries: TimelineEntry[]): Promise<void> {
    await writeText(timelinePath(id), JSON.stringify(entries));
    log.debug("store", "timeline.save", { id, count: entries.length });
  }

  async saveMedia(noteId: string, bytes: Uint8Array | ArrayBuffer, ext: string): Promise<string> {
    const ref = mediaRef(noteId, newMediaId(), ext);
    try {
      // base64 over invoke (not a JS number array) — the IPC bridge is slow for raw byte
      // arrays; Rust decodes it in write_bytes.
      await writeBytes(ref, bytesToBase64(bytes));
      log.info("media", "save", { noteId, ref, bytes: bytes.byteLength });
      return ref;
    } catch (e) {
      log.error("media", "save.error", { noteId, ref, error: String(e) });
      throw e;
    }
  }

  async listMedia(): Promise<string[]> {
    // media/<noteId>/<file>: the top level is per-note folders, each holding the files.
    const noteDirs = await listDir("media");
    const refs: string[] = [];
    for (const noteId of noteDirs) {
      const files = await listDir(`media/${noteId}`);
      for (const f of files) refs.push(`media/${noteId}/${f}`);
    }
    return refs;
  }

  async loadMediaUrl(ref: string): Promise<string | null> {
    // Build the absolute vault path and hand it to the asset protocol. We don't probe
    // the file first (that'd be a second IPC round-trip per image) — a missing file shows
    // as a broken image, handled by the UI's broken/missing state later.
    const abs = `${await vaultRoot()}/${ref}`;
    return convertFileSrc(abs);
  }

  async removeMedia(ref: string): Promise<void> {
    await removePath(ref);
    log.info("media", "remove", { ref });
  }
}
