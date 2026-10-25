// mediaStore.ts — the phone's media byte store.
//
// Image BYTES live in IndexedDB keyed by the vault-relative ref (`media/<noteId>/<id>.<ext>`)
// so a photo survives a reload without bloating localStorage (base64 would blow its ~5MB
// quota in one shot). Refs resolve to object URLs for <img src>; a small in-memory cache
// makes a just-inserted image resolve synchronously (instant display) while the IndexedDB
// write settles in the background. When PWA-CAPTURE + real sync land, these bytes reach the
// vault / OneDrive — the ref is already the vault-relative path the desktop expects.
//
// (This mirrors the desktop src/lib/store/idb.ts shape. It is re-implemented here rather than
// imported because the phone app is deliberately decoupled from the desktop `src/` tree —
// they share only design tokens. A future shared `lib/` boundary could unify the two.)

import { isMediaPath, MEDIA_DIR } from "./noteMedia";
import { parseTranscript, transcriptRefFor, type Transcript } from "./transcript";

const DB_NAME = "pensieve-phone-media";
const STORE = "blobs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ref -> object URL, so a resolved image is reused and a just-inserted one is instant.
const urlCache = new Map<string, string>();

/** Persist bytes for a ref (background write). Swallows failures (quota / no IndexedDB). */
export async function putMedia(ref: string, blob: Blob): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put(blob, ref));
  } catch {
    /* no IndexedDB (jsdom) or quota — the in-memory object URL still shows this session */
  }
}

/** Register a freshly picked file: cache an object URL for instant display AND start the
 *  background byte write. Returns the object URL to drop into `<img src>` immediately. */
export function registerLocalMedia(ref: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  urlCache.set(ref, url);
  void putMedia(ref, blob);
  return url;
}

/** Resolve a ref → a loadable url. Cached refs and direct urls (data:/blob:/http) return
 *  synchronously-ish; a cold vault ref is read from IndexedDB → object URL. null if missing. */
export async function resolveMediaUrl(ref: string): Promise<string | null> {
  if (!ref) return null;
  if (!isMediaPath(ref)) return ref; // direct url (external / data:) — use as-is, like desktop
  const cached = urlCache.get(ref);
  if (cached) return cached;
  try {
    const blob = await tx<Blob | undefined>("readonly", (s) => s.get(ref));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(ref, url);
    return url;
  } catch {
    return null;
  }
}

/** Synchronous peek at the url cache (for instant same-session display). */
export function cachedMediaUrl(ref: string): string | null {
  if (!isMediaPath(ref)) return ref;
  return urlCache.get(ref) ?? null;
}

/** Delete a ref's bytes. Media is NOT auto-GC'd on block removal (version/timeline snapshots
 *  may still reference it, same as desktop) — this is for explicit cleanup only. */
export async function deleteMedia(ref: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(ref));
  } catch {
    /* no-op */
  }
}

/** Wipe every stored blob and revoke cached object URLs — used once by the fresh-start
 *  migration to clear demo-seed images left behind by an earlier, seed-backed build. */
export async function clearAllMedia(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.clear());
  } catch {
    /* no-op */
  }
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

/** Every ref currently stored — the real sync vault's backup/restore push-pull set. */
export async function listMediaKeys(): Promise<string[]> {
  try {
    const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
    return keys.map(String);
  } catch {
    return [];
  }
}

/** Raw bytes for a ref, or null if absent — the real sync vault's upload/push path. */
export async function getMediaBytes(ref: string): Promise<Uint8Array | null> {
  try {
    const blob = await tx<Blob | undefined>("readonly", (s) => s.get(ref));
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

/** Load an audio ref's sidecar transcript, if the sync backfill has pulled one down —
 *  null if none exists (most recordings won't have one) or it failed to parse. */
export async function loadTranscript(audioRef: string): Promise<Transcript | null> {
  const bytes = await getMediaBytes(transcriptRefFor(audioRef));
  if (!bytes) return null;
  try {
    return parseTranscript(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/svg+xml": "svg",
};

function extForFile(file: File): string {
  const byType = EXT_BY_TYPE[file.type];
  if (byType) return byType;
  const dot = file.name.lastIndexOf(".");
  if (dot > 0 && dot < file.name.length - 1) return file.name.slice(dot + 1).toLowerCase();
  return "png";
}

function mintMediaId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } catch {
    /* fall through */
  }
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 16);
}

/** Mint a stable vault-relative ref for a freshly picked file:
 *  `media/<noteId>/<mediaId>.<ext>` — matches the desktop path convention exactly. */
export function mintMediaRef(noteId: number | string, file: File): string {
  return `${MEDIA_DIR}/${noteId}/${mintMediaId()}.${extForFile(file)}`;
}
