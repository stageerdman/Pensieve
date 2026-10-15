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
import { ConflictError, EMPTY_SYNC_STATE, type MediaSyncRecord, type NoteSyncRecord, type SyncProgress, type SyncState } from "./types";
import type { RemoteItem } from "./types";
import {
  createRoot,
  delta,
  deleteNote,
  downloadMedia,
  downloadNote,
  getAccount,
  getQuota,
  listNotes,
  noteIdFromName,
  remoteRootExists,
  uploadMedia,
  uploadNote,
} from "./adapter";
import {
  extractMediaRefs,
  primeMediaBackupStates,
  setMediaBackupState,
} from "../media";
import { RemoteRootMissingError } from "./types";
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
  pushedMedia: string[]; // media refs uploaded to the remote this run
  pulledMedia: string[]; // media refs downloaded from the remote this run
  conflicts: SyncConflict[];
  lastSyncedAt: number;
}

const emptyResult = (): SyncResult => ({
  pulled: [],
  pushed: [],
  pulledDeletes: [],
  pushedDeletes: [],
  pushedMedia: [],
  pulledMedia: [],
  conflicts: [],
  lastSyncedAt: 0,
});

function nowMs(): number {
  return Date.now();
}

/** Download every referenced media binary a pulled note needs but the vault lacks, and
 *  record it as backed up (so a second machine / a restore rehydrates images). `have` is
 *  the set of refs already on disk (mutated as we add). Never throws — a flaky media
 *  download must not abort the whole sync; it's retried on a later sync. */
async function pullReferencedMedia(
  graph: GraphClient,
  vault: LocalVault,
  referencedRefs: Iterable<string>,
  have: Set<string>,
  media: Record<string, MediaSyncRecord>,
  result: SyncResult,
): Promise<void> {
  for (const ref of referencedRefs) {
    if (have.has(ref)) {
      media[ref] ??= { ref, backedUp: true };
      setMediaBackupState(ref, "backed-up");
      continue;
    }
    try {
      const bytes = await downloadMedia(graph, ref);
      if (!bytes) continue; // not on the remote (yet) — leave it; a later sync may find it
      await vault.writeMediaBytes(ref, bytes);
      have.add(ref);
      media[ref] = { ref, backedUp: true };
      setMediaBackupState(ref, "backed-up");
      result.pulledMedia.push(ref);
    } catch (e) {
      log.error("sync", "media.download.failed", { ref, error: String(e) });
    }
  }
}

/** Upload every local media binary not yet recorded as backed up. Content-addressed, so a
 *  present remote copy = done. Failures are recorded + surfaced via the backup-status
 *  store (auto-retried next sync), never thrown — one flaky image must not abort the sync. */
async function pushLocalMedia(
  graph: GraphClient,
  vault: LocalVault,
  media: Record<string, MediaSyncRecord>,
  result: SyncResult,
): Promise<void> {
  const local = await vault.listMedia();
  for (const ref of local) {
    if (media[ref]?.backedUp) {
      setMediaBackupState(ref, "backed-up");
      continue;
    }
    const bytes = await vault.readMediaBytes(ref);
    if (!bytes) continue;
    setMediaBackupState(ref, "uploading");
    try {
      const item = await uploadMedia(graph, ref, bytes);
      media[ref] = { ref, remoteId: item.id, backedUp: true };
      setMediaBackupState(ref, "backed-up");
      result.pushedMedia.push(ref);
    } catch (e) {
      media[ref] = { ref, remoteId: media[ref]?.remoteId, backedUp: false, failedAt: nowMs() };
      setMediaBackupState(ref, "failed");
      log.error("sync", "media.upload.failed", { ref, error: String(e) });
    }
  }
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
  // Gate on the remote root EXISTING — never auto-create it. If the user connected a
  // OneDrive that was never set up for Pensieve, we stop here and let the UI offer an
  // explicit "Summon Pensieve" (createRoot) rather than silently scattering a Pensieve
  // folder onto a drive they may have picked by mistake.
  if (!(await remoteRootExists(graph))) throw new RemoteRootMissingError();
  const state: SyncState = await vault.readState();
  if (!state.notes) state.notes = {};
  if (!state.media) state.media = {};
  // Reflect what's already backed up in the rune store before we transfer anything.
  primeMediaBackupStates(state.media);
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
    // A /delta tombstone can lack a name (only id + deleted facet) — map it back to
    // the local note by the remote id we recorded, so the deletion still propagates.
    let id = noteIdFromName(item.name);
    if (!id && item.deleted) {
      id = Object.keys(state.notes).find((k) => state.notes[k].remoteId === item.id) ?? null;
    }
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

  // Media refs mentioned by notes we pull this run — their binaries are fetched after.
  const pulledMediaRefs = new Set<string>();

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
    for (const ref of extractMediaRefs(dl.content)) pulledMediaRefs.add(ref);
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

  // ---------- MEDIA BACKUP ----------
  // Pull the binaries pulled notes reference (rehydrate on a second machine), then push
  // any local media not yet backed up. Media is the slow, large payload — kept off the
  // note progress bar (the gold rune on each image is its surface); it's best-effort so a
  // flaky image never blocks the note sync.
  const haveMedia = new Set(await vault.listMedia());
  await pullReferencedMedia(graph, vault, pulledMediaRefs, haveMedia, state.media!, result);
  await pushLocalMedia(graph, vault, state.media!, result);

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
    pushedMedia: result.pushedMedia.length,
    pulledMedia: result.pulledMedia.length,
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

/** Destructive full restore FROM the cloud: make this device an exact mirror of the
 *  remote Pensieve folder, throwing away ALL local changes. Every remote note is
 *  downloaded over local; any local note absent from the cloud is deleted. The sync
 *  bookkeeping is rebuilt as a fresh baseline (`deltaLink = null`) so the next ordinary
 *  sync starts clean and doesn't try to re-push the just-overwritten notes.
 *
 *  This is the owner's explicit "something got messed up here — take the cloud copy"
 *  escape hatch; it is NEVER called automatically (a normal sync would push local up).
 *  Reuses the SyncResult shape (as pure downloads + local deletes) so the sync UI's
 *  progress/success handling drives it unchanged. */
export async function restoreFromCloud(
  graph: GraphClient,
  vault: LocalVault,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  // Same gate as sync(): never touch local if the cloud side isn't actually set up.
  if (!(await remoteRootExists(graph))) throw new RemoteRootMissingError();
  const result = emptyResult();

  const remote = await listNotes(graph);
  const remoteIds = new Set<string>();
  for (const item of remote) {
    const id = noteIdFromName(item.name);
    if (id) remoteIds.add(id);
  }

  // Fresh state, rebuilt as we download. deltaLink stays null → next sync re-baselines.
  const state: SyncState = { ...EMPTY_SYNC_STATE, notes: {}, media: {} };

  const totalItems = remote.length;
  let doneItems = 0;

  // Media refs the restored notes reference — their binaries are fetched after the notes.
  const restoredMediaRefs = new Set<string>();

  // Download every remote note, overwriting local byte-for-byte.
  for (const item of remote) {
    const id = noteIdFromName(item.name);
    if (!id) continue;
    onProgress?.({ direction: "down", name: id, doneItems, totalItems, bytes: item.size });
    const dl = await downloadNote(graph, item.name);
    doneItems++;
    if (!dl) continue;
    const remoteTime = item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : nowMs();
    await vault.writeNote(id, dl.content, { updatedAt: remoteTime });
    for (const ref of extractMediaRefs(dl.content)) restoredMediaRefs.add(ref);
    state.notes[id] = {
      id,
      remoteId: item.id,
      cTag: dl.item.cTag ?? item.cTag ?? "",
      localUpdatedAt: remoteTime,
      syncedAt: nowMs(),
    };
    result.pulled.push(id);
  }

  // Drop every local note the cloud doesn't have — this is a mirror, not a merge.
  for (const info of await vault.listNotes()) {
    if (remoteIds.has(info.id)) continue;
    await vault.deleteNote(info.id);
    result.pulledDeletes.push(info.id);
  }

  // Rehydrate the referenced media binaries (content-addressed, so a fresh vault just
  // downloads them). Best-effort — a missing/flaky image shows its broken/rune state.
  const haveMedia = new Set(await vault.listMedia());
  await pullReferencedMedia(graph, vault, restoredMediaRefs, haveMedia, state.media!, result);

  state.lastSyncedAt = nowMs();
  result.lastSyncedAt = state.lastSyncedAt;
  await vault.writeState(state);

  log.info("sync", "restore.done", {
    pulled: result.pulled.length,
    deletedLocal: result.pulledDeletes.length,
    pulledMedia: result.pulledMedia.length,
  });
  return result;
}

/** A sync engine wired to the real keychain token provider + on-disk vault. */
export function createEngine(): {
  run(onProgress?: (p: SyncProgress) => void): Promise<SyncResult>;
  /** Overwrite this device wholesale with the cloud copy (see restoreFromCloud). */
  restore(onProgress?: (p: SyncProgress) => void): Promise<SyncResult>;
  /** Create the remote Pensieve folder, then run the first sync. The explicit
   *  "Summon Pensieve" action for a drive that wasn't set up yet. */
  summon(onProgress?: (p: SyncProgress) => void): Promise<SyncResult>;
  keepLocal(noteId: string): Promise<void>;
  /** The signed-in account + drive quota, for the sync panel. */
  info(): Promise<{ account: SyncAccount; quota: SyncQuota }>;
} {
  const graph = makeGraphClient({ getToken: getAccessToken, invalidate: clearTokenCache });
  const vault = tauriVault();
  return {
    run: (onProgress) => sync(graph, vault, onProgress),
    restore: (onProgress) => restoreFromCloud(graph, vault, onProgress),
    summon: async (onProgress) => {
      await createRoot(graph);
      return sync(graph, vault, onProgress);
    },
    keepLocal: (noteId: string) => resolveKeepLocal(graph, vault, noteId),
    async info() {
      const [account, quota] = await Promise.all([getAccount(graph), getQuota(graph)]);
      return { account, quota };
    },
  };
}
