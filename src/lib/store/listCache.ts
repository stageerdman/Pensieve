// FAST-LOAD: the derived-field cache behind the Tauri store's list().
//
// list() needs a few fields that only the `.md` can answer — the preview excerpt, the
// content char count (flask fill), and the frontmatter's icon / extra keys / links. Deriving
// them means reading + parsing every body (6+ MB for 2,090 notes) on every launch. Instead we
// keep them in `vault/.cache/list-index.json`, keyed per note by the `.md` file's stamp
// (mtime µs + byte size, from the Rust `list_notes_bulk` command). A note whose stamp still
// matches is served from the cache; anything else — an edit, a sync pull, a hand edit — is
// re-derived from the body Rust sends back for exactly that note.
//
// The `.md` stays the only source of truth: the cache holds nothing that can't be rebuilt,
// so deleting it (or a version bump below) just costs one cold listing.

import type { NoteIcon, NoteMeta } from "../types";
import { parseFrontmatter } from "../md/frontmatter";
import { contentCharCount, excerptFromMarkdown } from "../text";

/** Bump whenever excerptFromMarkdown / contentCharCount / parseFrontmatter change what they
 *  derive — every cached entry is then recomputed on the next launch. */
export const LIST_CACHE_VERSION = 1;
export const LIST_CACHE_PATH = ".cache/list-index.json";

/** [mtime in µs, byte size] of a note's `.md` (see src-tauri/src/vault_bulk.rs). */
export type Stamp = [number, number];

export interface DerivedListFields {
  icon?: NoteIcon;
  extra?: Record<string, string>;
  links: string[];
  excerpt: string;
  chars: number;
}

export interface ListCacheEntry extends DerivedListFields {
  st: Stamp;
}

export interface ListCache {
  v: number;
  notes: Record<string, ListCacheEntry>;
}

/** The sidecar shape list() reads (system fields; see TauriStore's Meta). */
export interface ListMeta {
  title: string;
  createdAt: number;
  addedAt?: number;
  updatedAt: number;
  categories?: string[];
  tags?: string[];
  pinned?: boolean;
  starred?: boolean;
  openCount?: number;
  lastOpenedAt?: number;
}

/** One row of `list_notes_bulk`. `md` is present only when the caller's stamp missed. */
export interface NoteRecord {
  id: string;
  meta: ListMeta | null;
  stamp: Stamp | null;
  md: string | null;
}

export const emptyListCache = (): ListCache => ({ v: LIST_CACHE_VERSION, notes: {} });

/** Parse the on-disk cache. Missing, corrupt, or an older version → an empty cache. */
export function parseListCache(raw: string | null | undefined): ListCache {
  if (!raw) return emptyListCache();
  try {
    const c = JSON.parse(raw) as Partial<ListCache>;
    if (c.v !== LIST_CACHE_VERSION || !c.notes || typeof c.notes !== "object") return emptyListCache();
    return { v: LIST_CACHE_VERSION, notes: c.notes };
  } catch {
    return emptyListCache();
  }
}

/** id → stamp, the `known` argument for `list_notes_bulk`. */
export function knownStamps(cache: ListCache): Record<string, Stamp> {
  const out: Record<string, Stamp> = {};
  for (const [id, e] of Object.entries(cache.notes)) out[id] = e.st;
  return out;
}

/** The body-derived list fields of a raw `.md` (frontmatter + body). */
export function deriveFromFile(file: string): DerivedListFields {
  const { fields, body } = parseFrontmatter(file);
  return deriveFromBody(body, fields);
}

/** Same, from an already-split body + fields (the save path has them in hand). */
export function deriveFromBody(
  body: string,
  fields: { icon?: NoteIcon; extra?: Record<string, string>; links: string[] },
): DerivedListFields {
  return {
    icon: fields.icon,
    extra: fields.extra,
    links: fields.links,
    excerpt: excerptFromMarkdown(body),
    chars: contentCharCount(body),
  };
}

/** Assemble the NoteMeta list() returns from a sidecar + the derived fields. */
export function toNoteMeta(id: string, m: ListMeta, d: DerivedListFields): NoteMeta {
  return {
    id,
    title: m.title,
    createdAt: m.createdAt,
    addedAt: m.addedAt ?? m.createdAt,
    updatedAt: m.updatedAt,
    categories: m.categories ?? [],
    tags: m.tags ?? [],
    icon: d.icon,
    extra: d.extra,
    pinned: m.pinned ?? false,
    starred: m.starred ?? false,
    openCount: m.openCount ?? 0,
    lastOpenedAt: m.lastOpenedAt,
    links: d.links ?? [],
    excerpt: d.excerpt,
    chars: d.chars,
  };
}

export interface MergedListing {
  metas: NoteMeta[];
  /** The cache to keep: exactly the notes listed now (deleted notes pruned). */
  cache: ListCache;
  /** Notes whose derived fields were recomputed from a body this time. */
  misses: number;
  /** True when the cache changed and should be written back. */
  dirty: boolean;
}

/** Fold a bulk listing into NoteMetas, serving unchanged notes from `cache`. A note with no
 *  sidecar is skipped (as list() always has); a note whose body didn't come back and has no
 *  cache entry (its `.md` vanished mid-listing) is skipped too. Unsorted — order is a view
 *  concern (lib/sidebar/arrange). */
export function mergeListing(records: NoteRecord[], cache: ListCache): MergedListing {
  const next: ListCache = { v: LIST_CACHE_VERSION, notes: {} };
  const metas: NoteMeta[] = [];
  let misses = 0;
  for (const r of records) {
    let entry: ListCacheEntry | undefined;
    if (r.md != null && r.stamp) {
      entry = { st: r.stamp, ...deriveFromFile(r.md) };
      misses++;
    } else {
      entry = cache.notes[r.id];
    }
    if (entry) next.notes[r.id] = entry;
    if (!r.meta || !entry) continue;
    metas.push(toNoteMeta(r.id, r.meta, entry));
  }
  const pruned = Object.keys(cache.notes).some((id) => !(id in next.notes));
  return { metas, cache: next, misses, dirty: misses > 0 || pruned };
}
