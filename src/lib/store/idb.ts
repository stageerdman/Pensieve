// IndexedDB-backed blob store for the browser/phone adapter. Media bytes must NOT go into
// localStorage (base64 would blow its ~5MB quota in one photo); they live in IndexedDB,
// keyed by the vault-relative media ref, and resolve to object URLs at load. When PWA
// capture + sync land, these bytes reach the real vault/OneDrive.
//
// Persistence sits behind this small interface so BrowserStore can take an injected
// in-memory implementation in tests (jsdom ships no IndexedDB).

export interface MediaBlobStore {
  put(ref: string, blob: Blob): Promise<void>;
  get(ref: string): Promise<Blob | null>;
  delete(ref: string): Promise<void>;
  /** All stored refs (keys) — for the reuse-an-image library. */
  keys(): Promise<string[]>;
}

const DB_NAME = "pensieve-media";
const STORE = "blobs";

/** The default implementation, backed by IndexedDB. Opens the db lazily on first use so
 *  constructing it never touches IndexedDB (safe where it's absent, e.g. jsdom). */
export function createIdbMediaStore(): MediaBlobStore {
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

  async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async put(ref, blob) {
      await tx("readwrite", (s) => s.put(blob, ref));
    },
    async get(ref) {
      const v = await tx<Blob | undefined>("readonly", (s) => s.get(ref));
      return v ?? null;
    },
    async delete(ref) {
      await tx("readwrite", (s) => s.delete(ref));
    },
    async keys() {
      const ks = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
      return ks.map(String);
    },
  };
}
