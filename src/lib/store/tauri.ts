// Tauri storage adapter — the on-disk vault for the native .app. Same Store
// interface as the browser adapter, so feature code never knows which is active.
// Layout under <appData>/vault/:
//   notes/<id>.md         frontmatter (category/tags/links) + Markdown body — truth
//   notes/<id>.meta.json  { title, createdAt, updatedAt } — system fields, fast list
//   timelines/<id>.json   TimelineEntry[]

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import type { Category, Note, NoteBody, NoteMeta, RawMemory, Store, TimelineEntry } from "../types";
import { titleFromMarkdown } from "../text";
import { parseFrontmatter, composeFrontmatter } from "../md/frontmatter";
import { pruneToRecentDays } from "../timeline";
import { log } from "../logger";
import { newMediaId, mediaRef, bytesToBase64 } from "../media";
import { buildSearchBody } from "../search/searchBody";
import { transcriptRefFor, parseTranscript } from "../transcripts/transcript";
import { extractMediaRefs } from "../media/ref";
import {
  LIST_CACHE_PATH,
  knownStamps,
  mergeListing,
  parseListCache,
  type ListCache,
  type NoteRecord,
} from "./listCache";
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
/** The vault's absolute root on disk — exported for the one legitimate reach-outside-
 *  the-Store case: the Phase 5 AI page-description subprocess needs a real filesystem
 *  path to Read (see lib/raw/describePageTauri.ts), which only exists under Tauri. */
export async function vaultRoot(): Promise<string> {
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
  // rewriting the .md. (The preview excerpt is derived from the body — cached in lib/store/listCache.)
  pinned?: boolean;
  // Same sidecar-only contract as pinned — see NoteMeta.starred.
  starred?: boolean;
  // Engagement signals — sidecar-only (never .md), bumped by markOpened and preserved
  // across saves. See NoteMeta.openCount.
  openCount?: number;
  lastOpenedAt?: number;
}

function newId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export class TauriStore implements Store {
  // FAST-LOAD: the derived-field cache (lib/store/listCache), held in memory after the first
  // listing so later relists (sync pull, AI tag adopt) skip re-reading the cache file.
  private listCache: ListCache | null = null;

  async list(): Promise<NoteMeta[]> {
    const t0 = performance.now();
    // One invoke for the whole vault (parallel reads in Rust). Bodies only come back for
    // notes whose .md stamp no longer matches the cache — a warm start ships none.
    const cache = this.listCache ?? parseListCache(await readText(LIST_CACHE_PATH).catch(() => null));
    const records = await invoke<NoteRecord[]>("list_notes_bulk", { known: knownStamps(cache), withBodies: true });
    const merged = mergeListing(records, cache);
    this.listCache = merged.cache;
    if (merged.dirty) {
      // Off the hot path: the listing is already usable; a failed write only costs the
      // next launch a recompute.
      void writeText(LIST_CACHE_PATH, JSON.stringify(merged.cache)).catch((e) =>
        log.warn("store", "listCache.write.failed", { error: String(e) }),
      );
    }
    log.info("store", "list", {
      count: merged.metas.length,
      misses: merged.misses,
      ms: Math.round(performance.now() - t0),
    });
    // Order is a view concern now (see lib/sidebar/arrange) — return unsorted.
    return merged.metas;
  }

  async bodies(): Promise<NoteBody[]> {
    // Two invokes total: every .md at once, then every referenced transcript sidecar at once
    // (was one serial read per note + one per media ref).
    const files = await invoke<{ id: string; md: string }[]>("read_note_bodies");
    const parsed = files.map((f) => ({ id: f.id, body: parseFrontmatter(f.md).body }));
    const refs = [...new Set(parsed.flatMap((p) => extractMediaRefs(p.body)))];
    const texts = refs.length
      ? await invoke<(string | null)[]>("read_texts_bulk", { rels: refs.map(transcriptRefFor) })
      : [];
    const transcripts = new Map<string, Transcript | null>();
    refs.forEach((ref, i) => transcripts.set(ref, texts[i] ? parseTranscript(texts[i] as string) : null));
    const out: NoteBody[] = [];
    for (const p of parsed) {
      // Markdown + folded transcript sidecars (shared with the single-note reindex path) so
      // spoken words are findable in Accio (transcripts are sidecars, not in the .md).
      const text = await buildSearchBody(p.body, async (ref) => transcripts.get(ref) ?? null);
      out.push({ id: p.id, text });
    }
    log.debug("search", "bodies.read", { count: out.length, transcripts: refs.length });
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
      extra: fields.extra,
      pinned: m.pinned ?? false,
      starred: m.starred ?? false,
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
      starred: note.starred,
      openCount: prev?.openCount,
      lastOpenedAt: prev?.lastOpenedAt,
    };
    const file = composeFrontmatter(
      { categories: note.categories, tags: note.tags, links: note.links, icon: note.icon, extra: note.extra },
      note.markdown,
    );
    // Sidecar first, .md last: the .md is what makes a note exist in the listing, so a crash
    // between the two never shows a note with a missing sidecar (wrong date/title).
    await writeText(metaPath(note.id), JSON.stringify(meta));
    await writeText(notePath(note.id), file);
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
      starred: false,
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

  async setStarred(id: string, starred: boolean): Promise<void> {
    // Same non-edit, sidecar-only contract as setPinned.
    const raw = await readText(metaPath(id));
    if (!raw) return;
    const m = JSON.parse(raw) as Meta;
    await writeText(metaPath(id), JSON.stringify({ ...m, starred }));
    log.debug("store", "star", { id, starred });
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
    // media/<noteId>/<file> — one invoke walks every per-note folder (was one per folder).
    return invoke<string[]>("list_media_bulk");
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

  // --- Raw Memory ------------------------------------------------------------------
  // raw/<id>.json — a tiny record, never a notes/ file (excluded from list()/search by
  // construction: nothing here ever reads raw/ into the note listing).
  async listRawMemories(): Promise<RawMemory[]> {
    const files = (await listDir("raw").catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
    const texts = files.length
      ? await invoke<(string | null)[]>("read_texts_bulk", { rels: files.map((f) => `raw/${f}`) })
      : [];
    const out: RawMemory[] = [];
    for (const [i, f] of files.entries()) {
      const raw = texts[i];
      if (!raw) continue;
      try {
        out.push(JSON.parse(raw) as RawMemory);
      } catch {
        log.error("raw", "list.parse-error", { file: f });
      }
    }
    return out;
  }

  async loadRawMemory(id: string): Promise<RawMemory | null> {
    const raw = await readText(`raw/${id}.json`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RawMemory;
    } catch {
      return null;
    }
  }

  async saveRawMemory(rm: RawMemory): Promise<void> {
    // Always stamped here (never trusted from the caller) — same contract as a note's
    // updatedAt, and what the sync engine's "did this change locally?" check depends on.
    const stamped: RawMemory = { ...rm, updatedAt: Date.now() };
    await writeText(`raw/${rm.id}.json`, JSON.stringify(stamped));
    log.info("raw", "save", { id: rm.id, status: rm.status, pages: rm.pages.length });
  }

  async removeRawMemory(id: string): Promise<void> {
    // A form PACKAGE resolves into the memory with the SAME id — that memory owns media/<id>/
    // now, so only a Journal batch's folder is wiped (see lib/packages/record).
    const ownedByMemory = (await readText(`notes/${id}.md`).catch(() => null)) !== null;
    const files = ownedByMemory ? [] : await listDir(`media/${id}`).catch(() => [] as string[]);
    // The record goes FIRST: a crash before the photos are gone leaves only orphan photos
    // (harmless), never a record whose pages are half-deleted (it would wait for them forever).
    await removePath(`raw/${id}.json`);
    for (const f of files) await removePath(`media/${id}/${f}`).catch(() => undefined);
    log.info("raw", "remove", { id, pagesRemoved: files.length });
  }
}
