// vaultStore.ts — the phone's note vault: id minting + persistence.
//
// Extracted from PhoneApp.tsx so lib/sync/vault.ts (the real OneDrive LocalVault)
// can read/write the SAME storage the Wand UI renders from, instead of a second,
// divergent copy.
//
// STORAGE (NOTION-IMPORT, 2026-11-15): notes live in IndexedDB, not localStorage.
// localStorage caps at ~5 MB per origin and `setItem` past it throws — which this module
// used to swallow, so the phone silently stopped saving. The Notion import alone is ~7 MB
// of text. IndexedDB has room for gigabytes.
//
// The API stays SYNCHRONOUS (loadVault/persistVault) so no caller changes: the vault is
// read from IndexedDB once at boot (`hydrateVault`, awaited in main.tsx before the first
// render) into an in-memory serialized copy; reads parse that copy (fresh objects every
// call, exactly like the old localStorage parse), and writes update it immediately and
// write it through to IndexedDB in order (latest wins). A device that still has notes in
// localStorage has them moved over once, then the old key is removed.
//
// Before hydration (unit tests, or IndexedDB unavailable e.g. private mode) the old
// localStorage behaviour is used unchanged.
//
// `newId()` mirrors the desktop browser store's scheme (src/lib/store/browser.ts)
// — a base36 time prefix + random suffix — so a note minted on the phone is a
// globally-unique id compatible with the desktop vault's `.md` basename.
//
// NO seed fallback here (PWA-CAPTURE v2) — the real vault starts genuinely empty
// until OneDrive sync or the owner's own writing fills it.

import type { Note } from "./types";

export function newId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

const VAULT_KEY = "pensieve.phone.vault";
const DB_NAME = "pensieve-phone-vault";
const STORE = "kv";

/** The authoritative in-memory copy once hydrated (serialized JSON array), else null. */
let memory: string | null = null;
let hydrated = false;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDb());

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

/** Read the vault from IndexedDB into memory (moving a localStorage vault over once).
 *  Await before the first render. Never throws — on failure the module keeps using
 *  localStorage, i.e. the pre-IndexedDB behaviour. */
export async function hydrateVault(timeoutMs = 4000): Promise<void> {
  // A wedged IndexedDB must never leave the app on a blank screen: past the timeout we
  // boot on localStorage and IGNORE a late answer (switching stores mid-session would
  // fork the vault).
  let abandoned = false;
  await Promise.race([
    hydrateFromIdb(() => abandoned),
    new Promise<void>((r) => setTimeout(() => ((abandoned = true), r()), timeoutMs)),
  ]);
}

async function hydrateFromIdb(isAbandoned: () => boolean): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    const stored = await idb<unknown>("readonly", (s) => s.get(VAULT_KEY));
    if (isAbandoned()) return;
    // A localStorage vault, when present, is always the newest copy: it is removed only
    // after a hydration fully succeeds, so it survives exactly when a previous boot fell
    // back to it (and may have edited it since).
    let legacy: string | null = null;
    try {
      legacy = localStorage.getItem(VAULT_KEY);
    } catch {
      /* unavailable */
    }
    if (legacy !== null || typeof stored !== "string") {
      const initial = legacy ?? "[]";
      await idb("readwrite", (s) => s.put(initial, VAULT_KEY));
      if (isAbandoned()) return;
      memory = initial;
    } else {
      memory = stored;
    }
    if (isAbandoned()) return;
    hydrated = true;
    try {
      localStorage.removeItem(VAULT_KEY); // only after IndexedDB holds the notes
    } catch {
      /* unavailable */
    }
  } catch {
    if (!isAbandoned()) {
      memory = null;
      hydrated = false;
    }
  }
}

// Write-through queue: one IndexedDB write at a time, always of the newest snapshot.
let pending: string | null = null;
let writing = false;
async function flush(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    while (pending !== null) {
      const snapshot = pending;
      pending = null;
      try {
        await idb("readwrite", (s) => s.put(snapshot, VAULT_KEY));
      } catch {
        /* a failed write is superseded by the next persist; memory stays authoritative */
      }
    }
  } finally {
    writing = false;
  }
}

/** Resolves once every queued write has reached IndexedDB (tests / before teardown). */
export async function vaultWritesSettled(): Promise<void> {
  while (writing || pending !== null) {
    await flush();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function parse(raw: string | null): Note[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.every((n) => n && typeof n.id === "string")) return v as Note[];
  } catch {
    /* corrupt — treat as empty rather than crash */
  }
  return [];
}

export function loadVault(): Note[] {
  if (hydrated) return parse(memory);
  try {
    return parse(localStorage.getItem(VAULT_KEY));
  } catch {
    return [];
  }
}

export function persistVault(data: Note[]): void {
  const json = JSON.stringify(data);
  if (hydrated) {
    memory = json;
    pending = json;
    void flush();
    return;
  }
  try {
    localStorage.setItem(VAULT_KEY, json);
  } catch {
    /* quota / unavailable — a reload just starts from whatever was last saved */
  }
}

/** Wipe the vault back to nothing. Does NOT touch media bytes (IndexedDB) or the
 *  OneDrive connection/sync state. */
export function clearVault(): void {
  if (hydrated) persistVault([]);
  try {
    localStorage.removeItem(VAULT_KEY);
  } catch {
    /* unavailable — nothing to clear */
  }
}

/** Test-only: forget the hydrated state so a test starts on the localStorage path. */
export function __resetVaultForTests(): void {
  memory = null;
  hydrated = false;
  pending = null;
  dbPromise = null;
}
