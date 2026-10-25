// recordingStore.ts — crash-safe, chunked storage for an IN-PROGRESS voice recording.
//
// A separate IndexedDB database from mediaStore.ts's stable blob store on purpose: a recording
// session's lifecycle (create → append chunk every few seconds → finalize or recover) is
// throwaway bookkeeping, not vault data, and keeping it isolated means it can never collide
// with or need to migrate alongside the media-blob schema. Every chunk MediaRecorder hands us
// is written here the instant it arrives, so a crash/kill mid-recording loses at most one
// chunk's worth of audio (a few seconds) — never the whole take. voiceCapture.ts is the only
// caller; this module is pure storage, no MediaRecorder/DOM knowledge.

const DB_NAME = "pensieve-phone-recording";
const SESSION_STORE = "sessions";
const CHUNK_STORE = "chunks";

export interface RecordingSessionMeta {
  id: string;
  noteId: string;
  mimeType: string;
  startedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CHUNK_STORE)) db.createObjectStore(CHUNK_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// Zero-padded so lexicographic string ordering matches numeric seq ordering, up to 99,999,999
// chunks (far beyond any real recording at a multi-second timeslice).
const SEQ_DIGITS = 8;
function chunkKey(sessionId: string, seq: number): string {
  return `${sessionId}#${String(seq).padStart(SEQ_DIGITS, "0")}`;
}
function chunkRange(sessionId: string): IDBKeyRange {
  return IDBKeyRange.bound(chunkKey(sessionId, 0), `${sessionId}#${"9".repeat(SEQ_DIGITS)}`);
}

/** Start a new recoverable session. Call ONCE per take, before the first chunk. */
export async function createSession(meta: RecordingSessionMeta): Promise<void> {
  await tx(SESSION_STORE, "readwrite", (s) => s.put(meta));
}

/** Persist one chunk as it arrives. Swallows failures (quota / no IndexedDB) — the caller
 *  still has the chunk in the live MediaRecorder stream; losing the durable copy just means a
 *  worse worst case, not an exception that aborts the recording. */
export async function appendChunk(sessionId: string, seq: number, blob: Blob): Promise<void> {
  try {
    await tx(CHUNK_STORE, "readwrite", (s) => s.put(blob, chunkKey(sessionId, seq)));
  } catch {
    /* no-op */
  }
}

/** Every chunk for a session, in order — the canonical source of truth for finalizing (NOT
 *  whatever the live MediaRecorder closure still has in memory, which may be gone by the time
 *  we finalize from a recovery sweep on a fresh page load). */
export async function readChunksOrdered(sessionId: string): Promise<Blob[]> {
  try {
    const all = await tx<Blob[]>(CHUNK_STORE, "readonly", (s) => s.getAll(chunkRange(sessionId)));
    return all;
  } catch {
    return [];
  }
}

/** Every session still on disk — present only when a take was never cleanly finalized (crash,
 *  OS kill, or the hidden-handler not getting to finish). The startup recovery sweep reads this. */
export async function listSessions(): Promise<RecordingSessionMeta[]> {
  try {
    return await tx<RecordingSessionMeta[]>(SESSION_STORE, "readonly", (s) => s.getAll());
  } catch {
    return [];
  }
}

/** Drop a session and all its chunks — call after a successful finalize (manual stop,
 *  background-hide finalize, or recovery sweep), never before. */
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await tx(CHUNK_STORE, "readwrite", (s) => s.delete(chunkRange(sessionId)));
    await tx(SESSION_STORE, "readwrite", (s) => s.delete(sessionId));
  } catch {
    /* no-op */
  }
}
