// vaultStore.ts — the phone's note vault: id minting + persistence.
//
// Extracted from PhoneApp.tsx so lib/sync/vault.ts (the real OneDrive LocalVault)
// can read/write the SAME storage the Wand UI renders from, instead of a second,
// divergent copy.
//
// STORAGE (FAST-LOAD, 2026-11-15): one IndexedDB record PER NOTE, held in memory as objects.
// History: localStorage (~5 MB cap, failed silently past it) → one IndexedDB key holding the
// whole vault as a JSON string (NOTION-IMPORT) → this. The single-string layout re-parsed ~7 MB
// on every loadVault() and re-stringified + rewrote all of it on every save; the sync LocalVault
// called it once per note, so a 2,000-note first pull was O(n²) (~47 s in the bench). Now:
//   - hydrateVault() reads every record once (getAll) into a Map<id, Rec> — never parsed again.
//   - getNote/putNote/removeNote/listNoteMeta are O(1)-per-note (sync uses these).
//   - loadVault()/persistVault() keep their whole-array shape for PhoneApp; persistVault DIFFS
//     against what it handed out and writes only the notes that actually changed.
//   - writes are coalesced: everything dirtied while a write is in flight goes in the next one
//     transaction, so a burst costs a handful of small transactions, not 7 MB each.
//
// COPY-ON-READ: callers mutate what they load (PhoneApp edits notes in place), so every read hands
// out a fresh deep copy. Stored records are private and immutable — replaced, never mutated —
// which lets persistVault compare by the object it handed out.
//
// THREE-WAY SAFETY: persistVault(data) only deletes notes the caller had SEEN (its last
// loadVault/persistVault), and only overwrites notes the caller CHANGED since then. So a full-array
// save from the UI during a sync pull can no longer wipe notes the pull just wrote behind its back
// (the old "vault = data" semantics would have, and the next sync would then push those as
// deletions).
//
// MIGRATION (crash-safe): the old single key (and the even older localStorage key) are moved
// into per-note records in ONE IndexedDB transaction that also writes the layout marker and deletes
// the old key — IndexedDB transactions are atomic, so a crash leaves either the old layout intact
// or the new one complete, never half. localStorage is removed only after that commits; if a crash
// lands between the two, the next boot re-migrates from localStorage (the newest copy, see below).
// A corrupt old blob is never deleted — it's parked under a backup key.
//
// Before hydration (unit tests, or IndexedDB unavailable e.g. private mode) the old localStorage
// behaviour is used unchanged.
//
// `newId()` mirrors the desktop browser store's scheme (src/lib/store/browser.ts)
// — a base36 time prefix + random suffix — so a note minted on the phone is a
// globally-unique id compatible with the desktop vault's `.md` basename.
//
// NO seed fallback here (PWA-CAPTURE v2) — the real vault starts genuinely empty
// until OneDrive sync or the owner's own writing fills it.

import type { Note } from "./types";
import { log } from "./lib/logger";

export function newId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

const VAULT_KEY = "pensieve.phone.vault"; // legacy: localStorage key AND the old single IDB key
const LAYOUT_KEY = "pensieve.phone.vault.layout";
const CORRUPT_KEY = "pensieve.phone.vault.corrupt";
const LAYOUT_PER_NOTE = 2;
const DB_NAME = "pensieve-phone-vault";
const KV = "kv";
const NOTES = "notes";

/** One stored note. `s` orders the vault (higher = earlier in the array, i.e. newer). */
interface Rec {
  s: number;
  n: Note;
}

/** The authoritative in-memory vault once hydrated, else null (localStorage mode). */
let recs: Map<string, Rec> | null = null;
let maxSeq = 0;
/** id → the stored note object at the time the whole-array caller last saw it. */
let baseline = new Map<string, Note>();
/** ids whose record must be (re)written or deleted on the next flush. */
const dirty = new Set<string>();
let ordered: Rec[] | null = null; // cache of recs sorted by s desc

// ---------------------------------------------------------------- plain-data helpers

function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as unknown as T;
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k in v) o[k] = clone((v as Record<string, unknown>)[k]);
    return o as T;
  }
  return v;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  for (const k in ao) if (ao[k] !== undefined && !deepEqual(ao[k], bo[k])) return false;
  for (const k in bo) if (bo[k] !== undefined && ao[k] === undefined) return false;
  return true;
}

function parse(raw: string | null): Note[] | null {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.every((n) => n && typeof n.id === "string")) return v as Note[];
  } catch {
    /* corrupt */
  }
  return null; // corrupt — the caller decides (never silently drop the blob)
}

// ---------------------------------------------------------------- IndexedDB

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      // Schema only — the data move happens in hydrate's single atomic transaction.
      if (!req.result.objectStoreNames.contains(KV)) req.result.createObjectStore(KV);
      if (!req.result.objectStoreNames.contains(NOTES)) req.result.createObjectStore(NOTES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDb());

/** Run `fn` in one transaction over `stores`; resolves with its result when the tx COMMITS. */
function tx<T>(mode: IDBTransactionMode, stores: string[], fn: (t: IDBTransaction) => () => T): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(stores, mode);
        let result: () => T;
        try {
          result = fn(t);
        } catch (e) {
          t.abort(); // all-or-nothing: never let the requests queued so far auto-commit
          throw e;
        }
        t.oncomplete = () => resolve(result());
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

// ---------------------------------------------------------------- hydration + migration

/** Read the vault from IndexedDB into memory (migrating an older layout once).
 *  Await before the first render. Never throws — on failure the module keeps using
 *  localStorage, i.e. the pre-IndexedDB behaviour. */
export async function hydrateVault(timeoutMs = 15000): Promise<void> {
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
  const t0 = performance.now();
  try {
    if (typeof indexedDB === "undefined") return;
    const read = await tx("readonly", [KV, NOTES], (t) => {
      const kv = t.objectStore(KV);
      const layout = kv.get(LAYOUT_KEY);
      const single = kv.get(VAULT_KEY);
      const keys = t.objectStore(NOTES).getAllKeys();
      const vals = t.objectStore(NOTES).getAll();
      return () => ({ layout: layout.result, single: single.result, keys: keys.result, vals: vals.result as Rec[] });
    });
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

    let source: Note[] | null = null; // non-null → (re)write the per-note store from it
    const corrupt: string[] = []; // unreadable old blobs — parked, never deleted
    let from = "per-note";
    if (legacy !== null) {
      source = parse(legacy);
      from = "localStorage";
      if (!source) corrupt.push(legacy);
    }
    if (!source && read.layout !== LAYOUT_PER_NOTE) {
      if (typeof read.single === "string") {
        source = parse(read.single);
        from = "single-key";
        if (!source) corrupt.push(read.single);
      }
      source ??= []; // a fresh install, or nothing readable: start the per-note layout empty
    }

    const next = new Map<string, Rec>();
    if (source) {
      // newest-first array → descending seqs
      source.forEach((n, i) => next.has(n.id) || next.set(n.id, { s: source!.length - i, n }));
      await tx("readwrite", [KV, NOTES], (t) => {
        const notes = t.objectStore(NOTES);
        const kv = t.objectStore(KV);
        notes.clear();
        for (const [id, r] of next) notes.put(r, id);
        if (corrupt.length) kv.put(corrupt, CORRUPT_KEY);
        kv.put(LAYOUT_PER_NOTE, LAYOUT_KEY);
        kv.delete(VAULT_KEY);
        return () => undefined;
      });
      if (isAbandoned()) return;
      log.info("vault", "migrated", { from, notes: next.size, corruptParked: corrupt.length });
    } else {
      if (corrupt.length) {
        // an unreadable localStorage blob: park it before localStorage is cleared below
        const blob = corrupt;
        await tx("readwrite", [KV], (t) => (t.objectStore(KV).put(blob, CORRUPT_KEY), () => undefined));
        log.warn("vault", "corrupt-legacy-parked", { bytes: blob[0].length });
      }
      read.vals.forEach((r, i) => {
        const id = read.keys[i];
        if (typeof id === "string" && r && r.n && typeof r.n.id === "string") next.set(id, r);
      });
    }
    if (isAbandoned()) return;

    recs = next;
    maxSeq = 0;
    for (const r of next.values()) if (r.s > maxSeq) maxSeq = r.s;
    ordered = null;
    baseline = new Map();
    try {
      localStorage.removeItem(VAULT_KEY); // only after IndexedDB holds the notes
    } catch {
      /* unavailable */
    }
    log.info("vault", "hydrated", { notes: next.size, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    if (!isAbandoned()) recs = null;
    log.warn("vault", "hydrate-failed", { error: String(e) });
  }
}

// ---------------------------------------------------------------- coalesced write-back

let writing = false;
let scheduled = false;

function markDirty(id: string) {
  dirty.add(id);
  ordered = null;
  if (!scheduled && !writing) {
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      void flush();
    }, 0);
  }
}

async function flush(): Promise<void> {
  if (writing || !recs) return;
  writing = true;
  try {
    while (dirty.size) {
      const ids = [...dirty];
      dirty.clear();
      // snapshot NOW (records are immutable, so holding the reference is the snapshot)
      const ops = ids.map((id) => [id, recs!.get(id)] as const);
      try {
        await tx("readwrite", [NOTES], (t) => {
          const s = t.objectStore(NOTES);
          for (const [id, r] of ops) {
            if (r) s.put(r, id);
            else s.delete(id);
          }
          return () => undefined;
        });
      } catch (e) {
        // keep memory authoritative; retry these with the next write
        for (const id of ids) dirty.add(id);
        log.warn("vault", "write-failed", { ids: ids.length, error: String(e) });
        break;
      }
    }
  } finally {
    writing = false;
  }
}

/** Resolves once every queued write has reached IndexedDB (tests / before teardown). */
export async function vaultWritesSettled(): Promise<void> {
  for (let guard = 0; guard < 1000 && (writing || scheduled || dirty.size); guard++) {
    await flush();
    await new Promise((r) => setTimeout(r, 0));
  }
}

// ---------------------------------------------------------------- localStorage mode

function lsLoad(): Note[] {
  try {
    return parse(localStorage.getItem(VAULT_KEY)) ?? [];
  } catch {
    return [];
  }
}
function lsPersist(data: Note[]) {
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(data));
  } catch {
    /* quota / unavailable — a reload just starts from whatever was last saved */
  }
}

// ---------------------------------------------------------------- whole-array API (PhoneApp)

function sorted(): Rec[] {
  return (ordered ??= [...recs!.values()].sort((a, b) => b.s - a.s));
}

/** Every note, newest-first, as fresh copies the caller may mutate. */
export function loadVault(): Note[] {
  if (!recs) return lsLoad();
  const list = sorted();
  baseline = new Map(list.map((r) => [r.n.id, r.n]));
  return list.map((r) => clone(r.n));
}

/** Save the caller's whole array: writes only the notes it changed, deletes only the notes it
 *  saw (last loadVault/persistVault) and dropped, and keeps its order. Notes written by someone
 *  else meanwhile (a sync pull) that it never saw are left alone. */
export function persistVault(data: Note[]): void {
  if (!recs) return lsPersist(data);
  const seen = new Map<string, Note>();
  let prev = -Infinity;
  for (let i = data.length - 1; i >= 0; i--) {
    const note = data[i];
    if (!note || typeof note.id !== "string" || seen.has(note.id)) continue;
    const rec = recs.get(note.id);
    const base = baseline.get(note.id) ?? rec?.n;
    const changed = !rec || !deepEqual(note, base);
    let s = rec?.s;
    const reorder = s === undefined || s <= prev;
    if (reorder) s = ++maxSeq;
    if (changed || reorder) {
      const r: Rec = { s: s!, n: changed ? clone(note) : rec!.n };
      recs.set(note.id, r);
      markDirty(note.id);
    }
    prev = s!;
    seen.set(note.id, recs.get(note.id)!.n);
  }
  for (const id of baseline.keys()) {
    if (!seen.has(id) && recs.delete(id)) markDirty(id);
  }
  baseline = seen;
}

/** Wipe the vault back to nothing. Does NOT touch media bytes (IndexedDB) or the
 *  OneDrive connection/sync state. */
export function clearVault(): void {
  if (recs) {
    for (const id of [...recs.keys()]) markDirty(id);
    recs.clear();
    baseline = new Map();
  }
  try {
    localStorage.removeItem(VAULT_KEY);
  } catch {
    /* unavailable — nothing to clear */
  }
}

// ---------------------------------------------------------------- per-note API (sync)

export interface NoteMeta {
  id: string;
  updatedAt: number;
  draft?: string;
}

/** id + updatedAt (+ draft) of every note — no copying of bodies. */
export function listNoteMeta(): NoteMeta[] {
  const list = recs ? sorted().map((r) => r.n) : lsLoad();
  return list.map((n) => (n.draft ? { id: n.id, updatedAt: n.updatedAt, draft: n.draft } : { id: n.id, updatedAt: n.updatedAt }));
}

/** One note as a fresh copy, or undefined. */
export function getNote(id: string): Note | undefined {
  if (!recs) return lsLoad().find((n) => n.id === id);
  const r = recs.get(id);
  return r ? clone(r.n) : undefined;
}

/** Insert (at the front — newest) or replace in place. */
export function putNote(note: Note): void {
  if (!recs) {
    const d = lsLoad();
    const i = d.findIndex((n) => n.id === note.id);
    if (i >= 0) d[i] = note;
    else d.unshift(note);
    return lsPersist(d);
  }
  const r = recs.get(note.id);
  recs.set(note.id, { s: r ? r.s : ++maxSeq, n: clone(note) });
  markDirty(note.id);
}

export function removeNote(id: string): void {
  if (!recs) return lsPersist(lsLoad().filter((n) => n.id !== id));
  if (recs.delete(id)) markDirty(id);
}

/** True when the in-memory vault is the real, fully loaded one. False when IndexedDB
 *  exists but hydration failed or timed out — the app is then running on a fallback
 *  (possibly EMPTY) copy, and a sync must not run: its "missing locally = deleted locally"
 *  pass would delete every note from OneDrive. */
export function vaultReady(): boolean {
  return recs !== null || typeof indexedDB === "undefined";
}

/** Test-only: forget the hydrated state so a test starts on the localStorage path. */
export function __resetVaultForTests(): void {
  recs = null;
  maxSeq = 0;
  baseline = new Map();
  dirty.clear();
  ordered = null;
  scheduled = false;
  writing = false;
  dbPromise = null;
}
