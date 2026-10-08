// The sync engine — one `sync()` that pulls remote changes into the vault then
// pushes local changes out, detecting conflicts in both directions so nothing is
// ever silently clobbered (the single-writer guarantee from the update doc).
//
// Both the GraphClient and the LocalVault are injected, so the whole engine is
// unit-testable with an in-memory vault + fake Graph, and driven by the real
// keychain path in production (see createEngine).

import type { GraphClient } from "./graph";
import { makeGraphClient } from "./graph";
import type { LocalVault } from "./vault";
import { tauriVault } from "./vault";
import { ConflictError, type NoteSyncRecord, type SyncProgress, type SyncState } from "./types";
import type { RemoteItem } from "./types";
import {
  delta,
  deleteNote,
  downloadNote,
  ensureRoot,
  getAccount,
  getQuota,
  noteIdFromName,
  uploadNote,
} from "./adapter";
import type { SyncAccount, SyncQuota } from "./types";
import { getAccessToken, clearTokenCache } from "./tokens";
import { log } from "../logger";

export type ConflictReason = "both-changed" | "push-rejected" | "delete-rejected";

export interface SyncConflict {
  noteId: string;
  reason: ConflictReason;
}

export interface SyncResult {
  pulled: string[]; // ids written from remote
  pushed: string[]; // ids sent to remote
  pulledDeletes: string[]; // ids removed locally because they vanished remotely
  pushedDeletes: string[]; // ids removed remotely because they vanished locally
  conflicts: SyncConflict[];
  lastSyncedAt: number;
}

const emptyResult = (): SyncResult => ({
  pulled: [],
  pushed: [],
  pulledDeletes: [],
  pushedDeletes: [],
  conflicts: [],
  lastSyncedAt: 0,
});

function nowMs(): number {
  return Date.now();
}

/** Run a full two-way sync. Pull first (so remote wins where only remote changed),
 *  then push (conditional, so a stale local write is refused). A note changed on
 *  BOTH sides is reported as a conflict and left untouched for the owner to resolve.
 *
 *  `onProgress` (optional) is called once per transferred item so the UI can show
 *  what's moving and how far along it is. The work is classified first (so the
 *  total is known before the first transfer) and only then applied. */
export async function sync(
  graph: GraphClient,
  vault: LocalVault,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  await ensureRoot(graph);
  const state: SyncState = await vault.readState();
  if (!state.notes) state.notes = {};
  const result = emptyResult();

  // ---------- PULL: classify ----------
  const { items, deltaLink } = await delta(graph, state.deltaLink);
  const localBefore = new Map((await vault.listNotes()).map((n) => [n.id, n.updatedAt]));
  // Notes changed on both sides: set aside after pull so push doesn't re-attempt
  // (and re-report) them. The owner resolves these; v1 leaves local as-is.
  const conflicted = new Set<string>();
  const localDeletes: string[] = []; // remote-deleted, apply locally (no transfer)
  const downloads: { id: string; item: RemoteItem }[] = [];

  for (const item of items) {
    if (item.folder) continue; // structural entry, not a note
    const id = noteIdFromName(item.name);
    if (!id) continue;
    const rec = state.notes[id];
    const localUpdatedAt = localBefore.get(id);
    const localChanged = localUpdatedAt !== undefined && rec !== undefined && localUpdatedAt > rec.localUpdatedAt;

    if (item.deleted) {
      if (localChanged) {
        result.conflicts.push({ noteId: id, reason: "both-changed" });
        conflicted.add(id);
      } else {
        localDeletes.push(id);
      }
      continue;
    }

    const remoteChanged = rec === undefined || rec.cTag !== item.cTag;
    if (localChanged && remoteChanged) {
      result.conflicts.push({ noteId: id, reason: "both-changed" });
      conflicted.add(id);
      continue;
    }
    if (!remoteChanged) continue; // our own echo / nothing new
    downloads.push({ id, item });
  }

  state.deltaLink = deltaLink;

  // ---------- PUSH: classify ----------
  const localNow = await vault.listNotes();
  const uploads = localNow.filter((info) => {
    if (conflicted.has(info.id)) return false; // set aside in pull — don't re-report
    const rec = state.notes[info.id];
    if (rec && info.updatedAt <= rec.localUpdatedAt) return false; // unchanged since last sync
    return true;
  });

  // ---------- APPLY ----------
  // Transfers (downloads + uploads) drive the progress bar; instant local deletes
  // don't. `doneItems` is emitted BEFORE each item starts, so the first shows as
  // "1 of N".
  const totalItems = downloads.length + uploads.length;
  let doneItems = 0;
  const emit = (direction: "down" | "up", name: string, bytes?: number) =>
    onProgress?.({ direction, name, doneItems, totalItems, bytes });

  // Remote deletions → local (no transfer, no progress tick).
  for (const id of localDeletes) {
    await vault.deleteNote(id);
    delete state.notes[id];
    localBefore.delete(id);
    result.pulledDeletes.push(id);
  }

  // Downloads.
  for (const { id, item } of downloads) {
    emit("down", id, item.size);
    const dl = await downloadNote(graph, item.name);
    if (!dl) {
      doneItems++;
      continue;
    }
    const remoteTime = item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : nowMs();
    await vault.writeNote(id, dl.content, { updatedAt: remoteTime });
    state.notes[id] = {
      id,
      remoteId: item.id,
      cTag: dl.item.cTag ?? item.cTag ?? "",
      localUpdatedAt: remoteTime,
      syncedAt: nowMs(),
    };
    localBefore.set(id, remoteTime); // so push skips the note we just wrote
    result.pulled.push(id);
    doneItems++;
  }

  // Uploads.
  for (const info of uploads) {
    const rec = state.notes[info.id];
    const content = await vault.readNote(info.id);
    if (content === null) {
      doneItems++;
      continue;
    }
    emit("up", info.id, content.length);

    try {
      const item = await uploadNote(graph, info.id, content, rec?.cTag);
      const next: NoteSyncRecord = {
        id: info.id,
        remoteId: item.id ?? rec?.remoteId ?? "",
        cTag: item.cTag ?? rec?.cTag ?? "",
        localUpdatedAt: info.updatedAt,
        syncedAt: nowMs(),
      };
      state.notes[info.id] = next;
      result.pushed.push(info.id);
    } catch (e) {
      if (e instanceof ConflictError) {
        result.conflicts.push({ noteId: info.id, reason: "push-rejected" });
      } else {
        throw e;
      }
    }
    doneItems++;
  }

  // ---------- LOCAL DELETIONS → remote ----------
  // Use the CURRENT on-disk set (downloads above added notes; localDeletes removed
  // some) — not the pre-download `localIds`, or a freshly-pulled note would look
  // deleted and get wrongly removed from the remote.
  const liveIds = new Set((await vault.listNotes()).map((n) => n.id));
  for (const id of Object.keys(state.notes)) {
    if (liveIds.has(id)) continue;
    const rec = state.notes[id];
    try {
      await deleteNote(graph, id, rec.cTag);
      delete state.notes[id];
      result.pushedDeletes.push(id);
    } catch (e) {
      if (e instanceof ConflictError) {
        result.conflicts.push({ noteId: id, reason: "delete-rejected" });
      } else {
        throw e;
      }
    }
  }

  state.lastSyncedAt = nowMs();
  result.lastSyncedAt = state.lastSyncedAt;
  await vault.writeState(state);

  log.info("sync", "sync.done", {
    pulled: result.pulled.length,
    pushed: result.pushed.length,
    pulledDeletes: result.pulledDeletes.length,
    pushedDeletes: result.pushedDeletes.length,
    conflicts: result.conflicts.length,
  });
  return result;
}

/** Resolve a both-changed conflict by keeping THIS device's copy. We adopt the
 *  remote's current cTag (so the next conditional push is accepted) and mark the
 *  note as locally changed, so the following sync overwrites the remote with local.
 *  The other device's version is replaced — the owner's explicit choice. */
export async function resolveKeepLocal(graph: GraphClient, vault: LocalVault, noteId: string): Promise<void> {
  const state = await vault.readState();
  const rec = state.notes[noteId];
  const dl = await downloadNote(graph, `${noteId}.md`);
  if (dl?.item.cTag) {
    state.notes[noteId] = {
      id: noteId,
      remoteId: dl.item.id ?? rec?.remoteId ?? "",
      cTag: dl.item.cTag, // adopt current remote tag so our next push's If-Match matches
      localUpdatedAt: -1, // force "changed locally" so the next sync pushes local
      syncedAt: rec?.syncedAt ?? nowMs(),
    };
  } else {
    // Remote was deleted meanwhile — drop the record so local re-creates it on push.
    delete state.notes[noteId];
  }
  await vault.writeState(state);
  log.info("sync", "conflict.keepLocal", { noteId });
}

/** A sync engine wired to the real keychain token provider + on-disk vault. */
export function createEngine(): {
  run(onProgress?: (p: SyncProgress) => void): Promise<SyncResult>;
  keepLocal(noteId: string): Promise<void>;
  /** The signed-in account + drive quota, for the sync panel. */
  info(): Promise<{ account: SyncAccount; quota: SyncQuota }>;
} {
  const graph = makeGraphClient({ getToken: getAccessToken, invalidate: clearTokenCache });
  const vault = tauriVault();
  return {
    run: (onProgress) => sync(graph, vault, onProgress),
    keepLocal: (noteId: string) => resolveKeepLocal(graph, vault, noteId),
    async info() {
      const [account, quota] = await Promise.all([getAccount(graph), getQuota(graph)]);
      return { account, quota };
    },
  };
}
