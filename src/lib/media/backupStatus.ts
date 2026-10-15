// The media-backup status store — a framework-light, module-level observable the sync
// engine updates per media ref and the editor subscribes to for the gold sync rune.
//
// "absence = healthy" (wiki States matrix): a backed-up image shows NO rune; the default
// (an unknown ref) is "local" (held, not safe yet). Pattern mirrors lightboxController:
// a tiny pub/sub callable from OUTSIDE React (the engine runs in the web/sync layer) and
// read INSIDE React via a thin useSyncExternalStore hook.
//
// It is also the single place the "N images backing up / a backup failed" aggregation is
// derived from, so the StatusWhisper + the one failure toast have one source of truth.

export type MediaBackupState = "local" | "uploading" | "backed-up" | "failed";

const states = new Map<string, MediaBackupState>();
const refListeners = new Map<string, Set<() => void>>();
const globalListeners = new Set<() => void>();

// Only surface runes once OneDrive backup is actually connected — otherwise every image
// on a drive-less setup would wear a permanent "not safe yet" dot, which is just noise.
let enabled = false;

export interface MediaBackupSummary {
  uploading: number;
  failed: number;
  /** Total refs the store is tracking (for debugging / tests). */
  total: number;
}
// A cached snapshot so useSyncExternalStore gets a STABLE reference between changes
// (React errors on a getSnapshot that returns a fresh object every call).
let summary: MediaBackupSummary = { uploading: 0, failed: 0, total: 0 };

function recomputeSummary(): void {
  let uploading = 0;
  let failed = 0;
  for (const s of states.values()) {
    if (s === "uploading") uploading++;
    else if (s === "failed") failed++;
  }
  summary = { uploading, failed, total: states.size };
}

function notifyRef(ref: string): void {
  refListeners.get(ref)?.forEach((l) => l());
}
function notifyGlobal(): void {
  recomputeSummary();
  globalListeners.forEach((l) => l());
}

/** Turn the runes on/off (the engine/useSync flips this with the connection). */
export function setMediaBackupEnabled(on: boolean): void {
  if (enabled === on) return;
  enabled = on;
  // An enable/disable flips every rune's visibility, so poke all subscribers.
  refListeners.forEach((set) => set.forEach((l) => l()));
  notifyGlobal();
}
export function isMediaBackupEnabled(): boolean {
  return enabled;
}

/** The backup state of a ref. Null/non-media → "backed-up" (i.e. render no rune). */
export function getMediaBackupState(ref: string | null | undefined): MediaBackupState {
  if (!ref) return "backed-up";
  return states.get(ref) ?? "local";
}

export function setMediaBackupState(ref: string, state: MediaBackupState): void {
  if (states.get(ref) === state) return;
  states.set(ref, state);
  notifyRef(ref);
  notifyGlobal();
}

/** Seed the store from persisted SyncState media records so runes reflect reality before
 *  any sync runs this session. Takes the bare record map (no SyncState import — keeps the
 *  media layer free of a dependency on the sync types). */
export function primeMediaBackupStates(records: Record<string, { backedUp: boolean }> | undefined): void {
  if (!records) return;
  for (const [ref, rec] of Object.entries(records)) {
    if (rec.backedUp) states.set(ref, "backed-up");
    else if (!states.has(ref)) states.set(ref, "local");
    notifyRef(ref);
  }
  notifyGlobal();
}

export function subscribeMediaBackup(ref: string, cb: () => void): () => void {
  let set = refListeners.get(ref);
  if (!set) {
    set = new Set();
    refListeners.set(ref, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) refListeners.delete(ref);
  };
}

export function subscribeMediaBackupAll(cb: () => void): () => void {
  globalListeners.add(cb);
  return () => {
    globalListeners.delete(cb);
  };
}

/** Stable summary snapshot (identity changes only when a value changed). */
export function mediaBackupSummary(): MediaBackupSummary {
  return summary;
}

/** Test helper — clear everything. */
export function _resetMediaBackup(): void {
  states.clear();
  refListeners.clear();
  globalListeners.clear();
  enabled = false;
  summary = { uploading: 0, failed: 0, total: 0 };
}
