// engine.ts — the sync engine: one `sync()` that pulls remote changes into the
// vault then pushes local changes out, detecting conflicts in both directions so
// nothing is ever silently clobbered. Mirrors src/lib/sync/engine.ts's algorithm
// exactly; the only things dropped are the desktop's large-media resumable-session
// path and its UI-facing media backup-state registry (no phone equivalent yet —
// see adapter.ts's header for why that's fine, not a shortcut).

import type { GraphClient } from "./graph";
import { makeGraphClient } from "./graph";
import type { LocalVault } from "./vault";
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
import { ConflictError, RemoteRootMissingError } from "./errors";
import { EMPTY_SYNC_STATE, type MediaSyncRecord, type RemoteItem, type SyncAccount, type SyncProgress, type SyncQuota, type SyncResult, type SyncState } from "./types";
import { getAccessToken, clearTokenCache } from "./tokens";
import { parseNoteContent } from "../media/noteMedia";
import { isMediaPath } from "../media/noteMedia";
import { transcriptRefFor } from "../media/transcript";

function extractMediaRefs(content: string): string[] {
  const refs: string[] = [];
  for (const block of parseNoteContent(content)) {
    if (block.kind === "image" && isMediaPath(block.ref)) {
      refs.push(block.ref);
    } else if (block.kind === "gallery") {
      for (const img of block.images) if (isMediaPath(img.ref)) refs.push(img.ref);
    } else if (block.kind === "audio" && isMediaPath(block.ref)) {
      refs.push(block.ref);
      // Always ASK for the sidecar too — downloadMedia/404 already no-ops cleanly when a
      // recording has no transcript yet, so this is free (no new sync machinery needed).
      refs.push(transcriptRefFor(block.ref));
    }
  }
  return refs;
}

function nowMs(): number {
  return Date.now();
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

/** Download every referenced media binary a pulled note needs but the vault lacks.
 *  Never throws — a flaky download must not abort the whole sync; retried later. */
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
      continue;
    }
    try {
      const bytes = await downloadMedia(graph, ref);
      if (!bytes) continue; // not on the remote (yet) — a later sync may find it
      await vault.writeMediaBytes(ref, bytes);
      have.add(ref);
      media[ref] = { ref, backedUp: true };
      result.pulledMedia.push(ref);
    } catch {
      /* flaky image — retried on a later sync */
    }
  }
}

/** Upload every local media binary not yet recorded as backed up. Content-addressed,
 *  so a present remote copy = done. Failures are recorded, never thrown. */
async function pushLocalMedia(graph: GraphClient, vault: LocalVault, state: SyncState, result: SyncResult): Promise<void> {
  const media = state.media!;
  for (const ref of await vault.listMedia()) {
    if (media[ref]?.backedUp) continue;
    const bytes = await vault.readMediaBytes(ref);
    if (!bytes) continue; // vanished since listing
    try {
      const item = await uploadMedia(graph, ref, bytes);
      media[ref] = { ref, remoteId: item.id, backedUp: true };
      result.pushedMedia.push(ref);
    } catch {
      media[ref] = { ref, remoteId: media[ref]?.remoteId, backedUp: false, failedAt: nowMs() };
    }
  }
}

/** Run a full two-way sync. Pull first (so remote wins where only remote changed),
 *  then push (conditional, so a stale local write is refused). A note changed on
 *  BOTH sides is reported as a conflict and left untouched for the owner to resolve. */
export async function sync(graph: GraphClient, vault: LocalVault, onProgress?: (p: SyncProgress) => void): Promise<SyncResult> {
  if (!(await remoteRootExists(graph))) throw new RemoteRootMissingError();
  const state: SyncState = await vault.readState();
  if (!state.notes) state.notes = {};
  if (!state.media) state.media = {};
  const result = emptyResult();

  // ---------- PULL: classify ----------
  const { items, deltaLink } = await delta(graph, state.deltaLink);
  const localBefore = new Map((await vault.listNotes()).map((n) => [n.id, n.updatedAt]));
  const conflicted = new Set<string>();
  const localDeletes: string[] = [];
  const downloads: { id: string; item: RemoteItem }[] = [];

  for (const item of items) {
    if (item.folder) continue;
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
        result.conflicts.push({ noteId: id, reason: "both-changed", localUpdatedAt });
        conflicted.add(id);
      } else {
        localDeletes.push(id);
      }
      continue;
    }

    const remoteChanged = rec === undefined || rec.cTag !== item.cTag;
    if (localChanged && remoteChanged) {
      const remoteUpdatedAt = item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : undefined;
      result.conflicts.push({ noteId: id, reason: "both-changed", localUpdatedAt, remoteUpdatedAt });
      conflicted.add(id);
      continue;
    }
    if (!remoteChanged) continue;
    downloads.push({ id, item });
  }

  state.deltaLink = deltaLink;

  // ---------- PUSH: classify ----------
  const localNow = await vault.listNotes();
  const uploads = localNow.filter((info) => {
    if (conflicted.has(info.id)) return false;
    const rec = state.notes[info.id];
    if (rec && info.updatedAt <= rec.localUpdatedAt) return false;
    return true;
  });

  // ---------- APPLY ----------
  const totalItems = downloads.length + uploads.length;
  let doneItems = 0;
  const emit = (direction: "down" | "up", name: string, bytes?: number) => onProgress?.({ direction, name, doneItems, totalItems, bytes });

  for (const id of localDeletes) {
    await vault.deleteNote(id);
    delete state.notes[id];
    localBefore.delete(id);
    result.pulledDeletes.push(id);
  }

  const pulledMediaRefs = new Set<string>();

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
    state.notes[id] = { id, remoteId: item.id, cTag: dl.item.cTag ?? item.cTag ?? "", localUpdatedAt: remoteTime, syncedAt: nowMs() };
    localBefore.set(id, remoteTime);
    result.pulled.push(id);
    doneItems++;
  }

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
      state.notes[info.id] = { id: info.id, remoteId: item.id ?? rec?.remoteId ?? "", cTag: item.cTag ?? rec?.cTag ?? "", localUpdatedAt: info.updatedAt, syncedAt: nowMs() };
      result.pushed.push(info.id);
    } catch (e) {
      if (e instanceof ConflictError) result.conflicts.push({ noteId: info.id, reason: "push-rejected" });
      else throw e;
    }
    doneItems++;
  }

  // ---------- MEDIA BACKUP ----------
  const haveMedia = new Set(await vault.listMedia());
  // Backfill: a note that WASN'T re-downloaded this pass (no remote delta) can still
  // reference media the vault lacks — e.g. a ref an older app version didn't recognise yet
  // (the pensieve:image fence fix is exactly this case) and so never queued for download.
  // Re-scan every local note's current refs, not just the ones just pulled, so a missing
  // photo self-heals on the very next regular sync instead of needing a destructive full
  // restore; pullReferencedMedia no-ops (via `have`) for refs already present.
  for (const info of localNow) {
    const content = await vault.readNote(info.id);
    if (content === null) continue;
    for (const ref of extractMediaRefs(content)) {
      // Only a ref genuinely MISSING locally — one already present is local-only, not yet
      // confirmed on the remote, and must go through pushLocalMedia below instead. Adding it
      // here would hit pullReferencedMedia's `have.has(ref)` branch, which marks it
      // backedUp:true on sight — short-circuiting the push that was actually still pending.
      if (!haveMedia.has(ref)) pulledMediaRefs.add(ref);
    }
  }
  await pullReferencedMedia(graph, vault, pulledMediaRefs, haveMedia, state.media!, result);
  await pushLocalMedia(graph, vault, state, result);

  // ---------- LOCAL DELETIONS → remote ----------
  const liveIds = new Set((await vault.listNotes()).map((n) => n.id));
  for (const id of Object.keys(state.notes)) {
    if (liveIds.has(id)) continue;
    const rec = state.notes[id];
    try {
      await deleteNote(graph, id, rec.cTag);
      delete state.notes[id];
      result.pushedDeletes.push(id);
    } catch (e) {
      if (e instanceof ConflictError) result.conflicts.push({ noteId: id, reason: "delete-rejected" });
      else throw e;
    }
  }

  state.lastSyncedAt = nowMs();
  result.lastSyncedAt = state.lastSyncedAt;
  await vault.writeState(state);
  return result;
}

/** Resolve a both-changed conflict by keeping THIS device's copy. */
export async function resolveKeepLocal(graph: GraphClient, vault: LocalVault, noteId: string): Promise<void> {
  const state = await vault.readState();
  const rec = state.notes[noteId];
  const dl = await downloadNote(graph, `${noteId}.md`);
  if (dl?.item.cTag) {
    state.notes[noteId] = { id: noteId, remoteId: dl.item.id ?? rec?.remoteId ?? "", cTag: dl.item.cTag, localUpdatedAt: -1, syncedAt: rec?.syncedAt ?? nowMs() };
  } else {
    delete state.notes[noteId];
  }
  await vault.writeState(state);
}

/** Resolve a both-changed conflict by discarding THIS device's edits and taking
 *  the remote's current copy instead. */
export async function resolveKeepRemote(graph: GraphClient, vault: LocalVault, noteId: string): Promise<void> {
  const state = await vault.readState();
  if (!state.media) state.media = {};
  const dl = await downloadNote(graph, `${noteId}.md`);
  if (!dl) {
    await vault.deleteNote(noteId);
    delete state.notes[noteId];
    await vault.writeState(state);
    return;
  }
  const remoteTime = dl.item.lastModifiedDateTime ? Date.parse(dl.item.lastModifiedDateTime) : nowMs();
  await vault.writeNote(noteId, dl.content, { updatedAt: remoteTime });
  const rec = state.notes[noteId];
  state.notes[noteId] = { id: noteId, remoteId: dl.item.id ?? rec?.remoteId ?? "", cTag: dl.item.cTag ?? "", localUpdatedAt: remoteTime, syncedAt: rec?.syncedAt ?? nowMs() };
  const haveMedia = new Set(await vault.listMedia());
  await pullReferencedMedia(graph, vault, extractMediaRefs(dl.content), haveMedia, state.media, emptyResult());
  await vault.writeState(state);
}

/** Destructive full restore FROM the cloud: make this device an exact mirror of
 *  the remote Pensieve folder, throwing away all local changes. */
export async function restoreFromCloud(graph: GraphClient, vault: LocalVault, onProgress?: (p: SyncProgress) => void): Promise<SyncResult> {
  if (!(await remoteRootExists(graph))) throw new RemoteRootMissingError();
  const result = emptyResult();

  const remote = await listNotes(graph);
  const remoteIds = new Set<string>();
  for (const item of remote) {
    const id = noteIdFromName(item.name);
    if (id) remoteIds.add(id);
  }

  const state: SyncState = { ...EMPTY_SYNC_STATE, notes: {}, media: {} };
  const totalItems = remote.length;
  let doneItems = 0;
  const restoredMediaRefs = new Set<string>();

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
    state.notes[id] = { id, remoteId: item.id, cTag: dl.item.cTag ?? item.cTag ?? "", localUpdatedAt: remoteTime, syncedAt: nowMs() };
    result.pulled.push(id);
  }

  for (const info of await vault.listNotes()) {
    if (remoteIds.has(info.id)) continue;
    await vault.deleteNote(info.id);
    result.pulledDeletes.push(info.id);
  }

  const haveMedia = new Set(await vault.listMedia());
  await pullReferencedMedia(graph, vault, restoredMediaRefs, haveMedia, state.media!, result);

  state.lastSyncedAt = nowMs();
  result.lastSyncedAt = state.lastSyncedAt;
  await vault.writeState(state);
  return result;
}

/** A sync engine wired to the real token provider + the phone's own vault. */
export function createEngine(vault: LocalVault): {
  run(onProgress?: (p: SyncProgress) => void): Promise<SyncResult>;
  restore(onProgress?: (p: SyncProgress) => void): Promise<SyncResult>;
  summon(onProgress?: (p: SyncProgress) => void): Promise<SyncResult>;
  keepLocal(noteId: string): Promise<void>;
  keepRemote(noteId: string): Promise<void>;
  info(): Promise<{ account: SyncAccount; quota: SyncQuota }>;
} {
  const graph = makeGraphClient({ getToken: getAccessToken, invalidate: clearTokenCache });
  return {
    run: (onProgress) => sync(graph, vault, onProgress),
    restore: (onProgress) => restoreFromCloud(graph, vault, onProgress),
    summon: async (onProgress) => {
      await createRoot(graph);
      return sync(graph, vault, onProgress);
    },
    keepLocal: (noteId) => resolveKeepLocal(graph, vault, noteId),
    keepRemote: (noteId) => resolveKeepRemote(graph, vault, noteId),
    async info() {
      const [account, quota] = await Promise.all([getAccount(graph), getQuota(graph)]);
      return { account, quota };
    },
  };
}
