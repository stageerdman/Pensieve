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
  createMediaUploadSession,
  createRoot,
  delta,
  deleteNote,
  deleteRawRecord,
  downloadMedia,
  downloadNote,
  downloadRawRecord,
  getAccount,
  getQuota,
  LARGE_MEDIA_THRESHOLD,
  listNotes,
  listRawRecords,
  mediaContentUrl,
  mediaMeta,
  noteIdFromName,
  queryUploadSession,
  rawIdFromItem,
  remoteRootExists,
  uploadMedia,
  uploadNote,
  uploadRawRecord,
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
  /** When known (the "both-changed" case, detected during the pull classification
   *  where both sides are already in hand): when each side last changed, so the
   *  panel can show a fact instead of a flat "changed here and elsewhere." */
  localUpdatedAt?: number;
  remoteUpdatedAt?: number;
}

export interface SyncResult {
  pulled: string[]; // note ids written from remote
  pushed: string[]; // note ids sent to remote
  pulledDeletes: string[]; // note ids removed locally because they vanished remotely
  pushedDeletes: string[]; // note ids removed remotely because they vanished locally
  pushedMedia: string[]; // media refs uploaded to the remote this run
  pulledMedia: string[]; // media refs downloaded from the remote this run
  // Raw Memory batches (RAW-MEMORY-JOURNAL) — kept in their OWN id-space, separate
  // from the note arrays above, since a raw id is never a note id and nothing
  // downstream (e.g. titleFor lookups) should ever conflate the two.
  pulledRaw: string[];
  pushedRaw: string[];
  pulledRawDeletes: string[];
  pushedRawDeletes: string[];
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
  pulledRaw: [],
  pushedRaw: [],
  pulledRawDeletes: [],
  pushedRawDeletes: [],
  conflicts: [],
  lastSyncedAt: 0,
});

function nowMs(): number {
  return Date.now();
}

/** Download every referenced media binary a pulled note needs but the vault lacks, and
 *  record it as backed up (so a second machine / a restore rehydrates images). `have` is
 *  the set of refs already on disk (mutated as we add). Never throws — a flaky media
 *  download must not abort the whole sync; it's retried on a later sync.
 *
 *  Below LARGE_MEDIA_THRESHOLD, this is the original single whole-buffer GET. At or
 *  above it, the native chunked downloader streams straight to disk (resuming from
 *  whatever a previous partial attempt left behind) — the file never passes through
 *  JS as one in-memory buffer. */
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
      const meta = await mediaMeta(graph, ref);
      if (!meta) continue; // not on the remote (yet) — leave it; a later sync may find it

      if (meta.size > LARGE_MEDIA_THRESHOLD && vault.downloadMediaStream) {
        const token = await graph.token();
        await vault.downloadMediaStream(ref, mediaContentUrl(ref), token, meta.size);
      } else {
        const bytes = await downloadMedia(graph, ref);
        if (!bytes) continue;
        await vault.writeMediaBytes(ref, bytes);
      }

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
 *  store (auto-retried next sync), never thrown — one flaky image must not abort the sync.
 *
 *  Below LARGE_MEDIA_THRESHOLD, this is the original single whole-buffer PUT. At or
 *  above it, a resumable Graph upload session takes over (see uploadLargeMedia) —
 *  takes `state` rather than just its `media` map so a freshly-created session can be
 *  checkpointed to disk immediately, before any bytes go out. */
async function pushLocalMedia(
  graph: GraphClient,
  vault: LocalVault,
  state: SyncState,
  result: SyncResult,
): Promise<void> {
  const media = state.media!;
  const local = await vault.listMedia();
  for (const ref of local) {
    if (media[ref]?.backedUp) {
      setMediaBackupState(ref, "backed-up");
      continue;
    }
    const size = await vault.mediaSize(ref);
    if (size == null) continue; // vanished since listing
    setMediaBackupState(ref, "uploading");
    try {
      const remoteId =
        size > LARGE_MEDIA_THRESHOLD && vault.uploadMediaStream
          ? await uploadLargeMedia(graph, vault, state, ref, size)
          : await uploadSmallMedia(graph, vault, ref);
      media[ref] = { ref, remoteId, backedUp: true };
      setMediaBackupState(ref, "backed-up");
      result.pushedMedia.push(ref);
    } catch (e) {
      // Keep any session handle uploadLargeMedia already persisted — that's exactly
      // what lets a stalled/interrupted transfer resume from where Graph left off
      // on the next sync, instead of restarting from byte 0.
      media[ref] = {
        ref,
        remoteId: media[ref]?.remoteId,
        backedUp: false,
        failedAt: nowMs(),
        uploadSession: media[ref]?.uploadSession,
      };
      setMediaBackupState(ref, "failed");
      log.error("sync", "media.upload.failed", { ref, error: String(e) });
    }
  }
}

async function uploadSmallMedia(graph: GraphClient, vault: LocalVault, ref: string): Promise<string | undefined> {
  const bytes = await vault.readMediaBytes(ref);
  if (!bytes) throw new Error("media vanished before upload");
  const item = await uploadMedia(graph, ref, bytes);
  return item.id;
}

/** Upload a large media file via a resumable Graph session, resuming an in-progress
 *  one if the owner closed the app mid-upload — Graph remembers how many bytes it
 *  already received (queried from its uploadUrl), so this picks up exactly where it
 *  left off rather than restarting. The session handle is written to disk via
 *  `vault.writeState` the moment it's created — BEFORE the first byte goes out — so a
 *  hard crash mid-transfer still leaves something to resume from on the next sync. */
async function uploadLargeMedia(
  graph: GraphClient,
  vault: LocalVault,
  state: SyncState,
  ref: string,
  size: number,
): Promise<string | undefined> {
  const media = state.media!;
  let session = media[ref]?.uploadSession;
  let resumeFrom = 0;

  if (session) {
    if (Date.parse(session.expirationDateTime) < nowMs()) {
      session = undefined; // Graph has already discarded an expired session
    } else {
      const next = await queryUploadSession(graph, session.uploadUrl);
      if (next == null) session = undefined; // gone/completed — start fresh
      else resumeFrom = next;
    }
  }

  if (!session) {
    session = await createMediaUploadSession(graph, ref);
    resumeFrom = 0;
    media[ref] = { ...(media[ref] ?? { ref, backedUp: false }), uploadSession: session };
    await vault.writeState(state); // checkpoint BEFORE sending any bytes
  }

  if (resumeFrom >= size) {
    // Every byte is already acknowledged — nothing left to send. We may not have the
    // final item id (a crash could land exactly here); the next /delta pull will pick
    // up the finished item either way.
    return media[ref]?.remoteId;
  }

  const { remoteId } = await vault.uploadMediaStream!(ref, session.uploadUrl, resumeFrom);
  return remoteId;
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
  if (!state.raw) state.raw = {};
  // Reflect what's already backed up in the rune store before we transfer anything.
  primeMediaBackupStates(state.media);
  const result = emptyResult();

  // ---------- PULL: classify ----------
  const { items, deltaLink } = await delta(graph, state.deltaLink);
  const localBefore = new Map((await vault.listNotes()).map((n) => [n.id, n.updatedAt]));
  const rawLocalBefore = new Map((await vault.listRawMemories()).map((n) => [n.id, n.updatedAt]));
  // Notes changed on both sides: set aside after pull so push doesn't re-attempt
  // (and re-report) them. The owner resolves these; v1 leaves local as-is.
  const conflicted = new Set<string>();
  const localDeletes: string[] = []; // remote-deleted, apply locally (no transfer)
  const downloads: { id: string; item: RemoteItem }[] = [];
  // Raw Memory batches get the SAME shape, but their own id-space and lists — see
  // SyncResult's doc comment for why they're never merged into the note arrays. No
  // conflict-resolution UI exists for a Raw Memory (it's single-writer in practice:
  // the phone creates/edits it, desktop only transitions status or deletes it), so a
  // genuine both-changed case is just left for the NEXT sync to re-evaluate rather
  // than surfacing a SyncConflict the owner has no way to act on.
  const rawConflicted = new Set<string>();
  const rawLocalDeletes: string[] = [];
  const rawDownloads: { id: string; item: RemoteItem }[] = [];

  for (const item of items) {
    if (item.folder) continue; // structural entry, not a note or a raw record

    // A /delta tombstone can lack a name (only id + deleted facet) — map it back to
    // the local note by the remote id we recorded, so the deletion still propagates.
    let id = noteIdFromName(item.name);
    if (!id && item.deleted) {
      id = Object.keys(state.notes).find((k) => state.notes[k].remoteId === item.id) ?? null;
    }
    if (id) {
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
      if (!remoteChanged) continue; // our own echo / nothing new
      downloads.push({ id, item });
      continue;
    }

    // Not a note — a Raw Memory record? Recognised by parent-path (raw/<id>.json),
    // not name suffix (see adapter.ts's rawIdFromItem) — it arrives on this SAME
    // recursive root /delta feed as notes, no second delta cursor needed.
    let rawId = rawIdFromItem(item);
    if (!rawId && item.deleted) {
      rawId = Object.keys(state.raw).find((k) => state.raw![k].remoteId === item.id) ?? null;
    }
    if (!rawId) continue; // media or anything else — not this loop's concern

    const rawRec = state.raw[rawId];
    const rawLocalUpdatedAt = rawLocalBefore.get(rawId);
    const rawLocalChanged = rawLocalUpdatedAt !== undefined && rawRec !== undefined && rawLocalUpdatedAt > rawRec.localUpdatedAt;

    if (item.deleted) {
      if (rawLocalChanged) rawConflicted.add(rawId);
      else rawLocalDeletes.push(rawId);
      continue;
    }

    const rawRemoteChanged = rawRec === undefined || rawRec.cTag !== item.cTag;
    if (rawLocalChanged && rawRemoteChanged) {
      rawConflicted.add(rawId);
      continue;
    }
    if (!rawRemoteChanged) continue;
    rawDownloads.push({ id: rawId, item });
  }

  state.deltaLink = deltaLink;

  // ---------- RAW RECONCILIATION (defensive) ----------
  // A delta tombstone for a raw record can be missed: confirmed against a REAL OneDrive
  // account (2026-11-10) that a deleted item's tombstone carries NO `name` and NO
  // `parentReference.path` at all, so recognition falls entirely on the remoteId
  // fallback above — and on a real device that fallback missed once, leaving a
  // desktop-deleted batch sitting locally forever and getting RE-UPLOADED as a stray
  // duplicate. Raw batches are few and short-lived (unlike notes, where a full listing
  // every sync would be wasteful), so independently verifying against the actual
  // raw/ folder listing here is cheap insurance against whatever caused the miss.
  const remoteRawNow = await listRawRecords(graph);
  const remoteRawIdsNow = new Set<string>();
  for (const item of remoteRawNow) {
    const id = rawIdFromItem(item);
    if (id) remoteRawIdsNow.add(id);
  }
  for (const id of rawLocalBefore.keys()) {
    if (remoteRawIdsNow.has(id)) continue; // still remote — nothing missed
    if (!state.raw[id]) continue; // never synced yet — a genuine new local create, not a delete
    if (rawLocalDeletes.includes(id) || rawConflicted.has(id)) continue; // already handled above
    rawLocalDeletes.push(id);
  }

  // ---------- PUSH: classify ----------
  const localNow = await vault.listNotes();
  const uploads = localNow.filter((info) => {
    if (conflicted.has(info.id)) return false; // set aside in pull — don't re-report
    const rec = state.notes[info.id];
    if (rec && info.updatedAt <= rec.localUpdatedAt) return false; // unchanged since last sync
    return true;
  });

  const rawLocalNow = await vault.listRawMemories();
  const rawUploads = rawLocalNow.filter((info) => {
    // A record about to be deleted (tombstone OR the reconciliation pass above) must
    // never ALSO be queued for re-upload — the two were never mutually exclusive by
    // construction the way notes' localDeletes/uploads are (notes only reach
    // localDeletes when NOT locally changed; a raw record can land in rawLocalDeletes
    // regardless, since the reconciliation pass doesn't know "locally changed" at all).
    if (rawConflicted.has(info.id) || rawLocalDeletes.includes(info.id)) return false;
    const rec = state.raw![info.id];
    if (rec && info.updatedAt <= rec.localUpdatedAt) return false;
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
  for (const id of rawLocalDeletes) {
    await vault.deleteRawMemory(id);
    delete state.raw[id];
    rawLocalBefore.delete(id);
    result.pulledRawDeletes.push(id);
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

  // Raw Memory downloads/uploads — quiet, no onProgress ticks (tiny JSON records, not
  // a heavy transfer; same "off the headline progress bar" treatment as media below).
  for (const { id, item } of rawDownloads) {
    const dl = await downloadRawRecord(graph, id);
    if (!dl) continue;
    const remoteTime = item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : nowMs();
    await vault.writeRawMemory(id, dl.content, { updatedAt: remoteTime });
    try {
      // pages (a Journal batch's photos) AND media (a package's recordings/photos).
      const parsed = JSON.parse(dl.content) as { pages?: unknown; media?: unknown };
      for (const list of [parsed.pages, parsed.media]) {
        if (Array.isArray(list)) for (const ref of list) if (typeof ref === "string") pulledMediaRefs.add(ref);
      }
    } catch {
      log.error("sync", "raw.pull.parse-error", { id });
    }
    state.raw[id] = {
      id,
      remoteId: item.id,
      cTag: dl.item.cTag ?? item.cTag ?? "",
      localUpdatedAt: remoteTime,
      syncedAt: nowMs(),
    };
    rawLocalBefore.set(id, remoteTime);
    result.pulledRaw.push(id);
  }

  for (const info of rawUploads) {
    const rec = state.raw[info.id];
    const content = await vault.readRawMemory(info.id);
    if (content === null) continue;
    try {
      const item = await uploadRawRecord(graph, info.id, content, rec?.cTag);
      state.raw[info.id] = {
        id: info.id,
        remoteId: item.id ?? rec?.remoteId ?? "",
        cTag: item.cTag ?? rec?.cTag ?? "",
        localUpdatedAt: info.updatedAt,
        syncedAt: nowMs(),
      };
      result.pushedRaw.push(info.id);
    } catch (e) {
      // No conflict-resolution UI for a Raw Memory (see the PULL-classify comment
      // above) — leave it for the next sync rather than throw or report a conflict
      // the owner has no way to act on.
      if (!(e instanceof ConflictError)) throw e;
      log.info("sync", "raw.push.conflict", { id: info.id });
    }
  }

  // ---------- MEDIA BACKUP ----------
  // Pull the binaries pulled notes reference (rehydrate on a second machine), then push
  // any local media not yet backed up. Media is the slow, large payload — kept off the
  // note progress bar (the gold rune on each image is its surface); it's best-effort so a
  // flaky image never blocks the note sync.
  const haveMedia = new Set(await vault.listMedia());
  await pullReferencedMedia(graph, vault, pulledMediaRefs, haveMedia, state.media!, result);
  await pushLocalMedia(graph, vault, state, result);

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

  // A Raw Memory vanishes locally in two cases, both of which SHOULD propagate as a
  // real remote delete: the owner deleted the batch from the phone, or desktop just
  // consumed it via processRawBatch (see useProcessQueue.ts) after successfully
  // writing the final Memories. Either way, once it's gone locally it should be gone
  // everywhere — same tombstone contract as a note (wiki.md's sync-tombstone decision).
  const rawLiveIds = new Set((await vault.listRawMemories()).map((n) => n.id));
  for (const id of Object.keys(state.raw)) {
    if (rawLiveIds.has(id)) continue;
    const rec = state.raw[id];
    try {
      await deleteRawRecord(graph, id, rec.cTag);
      delete state.raw[id];
      result.pushedRawDeletes.push(id);
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      log.info("sync", "raw.delete.conflict", { id });
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
    pulledRaw: result.pulledRaw.length,
    pushedRaw: result.pushedRaw.length,
    pulledRawDeletes: result.pulledRawDeletes.length,
    pushedRawDeletes: result.pushedRawDeletes.length,
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

/** Resolve a both-changed conflict by discarding THIS device's edits and taking the
 *  remote's current copy instead — the owner's explicit choice that the other device
 *  (or an earlier session) has the version that should win. Downloads the remote
 *  content over local, adopts its cTag, and rehydrates any newly-referenced media the
 *  vault doesn't already have, so the note reads as fully in sync immediately rather
 *  than waiting on the next full sync pass. */
export async function resolveKeepRemote(graph: GraphClient, vault: LocalVault, noteId: string): Promise<void> {
  const state = await vault.readState();
  if (!state.media) state.media = {};
  const dl = await downloadNote(graph, `${noteId}.md`);
  if (!dl) {
    // Remote was deleted meanwhile — nothing to keep; drop the local copy and the
    // bookkeeping record so it doesn't linger looking unresolved.
    await vault.deleteNote(noteId);
    delete state.notes[noteId];
    await vault.writeState(state);
    log.info("sync", "conflict.keepRemote", { noteId, outcome: "remote-deleted" });
    return;
  }
  const remoteTime = dl.item.lastModifiedDateTime ? Date.parse(dl.item.lastModifiedDateTime) : nowMs();
  await vault.writeNote(noteId, dl.content, { updatedAt: remoteTime });
  const rec = state.notes[noteId];
  state.notes[noteId] = {
    id: noteId,
    remoteId: dl.item.id ?? rec?.remoteId ?? "",
    cTag: dl.item.cTag ?? "",
    localUpdatedAt: remoteTime,
    syncedAt: rec?.syncedAt ?? nowMs(),
  };
  const haveMedia = new Set(await vault.listMedia());
  await pullReferencedMedia(graph, vault, extractMediaRefs(dl.content), haveMedia, state.media, emptyResult());
  await vault.writeState(state);
  log.info("sync", "conflict.keepRemote", { noteId });
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
  const remoteRaw = await listRawRecords(graph);
  const remoteRawIds = new Set<string>();
  for (const item of remoteRaw) {
    const id = rawIdFromItem(item);
    if (id) remoteRawIds.add(id);
  }

  // Fresh state, rebuilt as we download. deltaLink stays null → next sync re-baselines.
  const state: SyncState = { ...EMPTY_SYNC_STATE, notes: {}, media: {}, raw: {} };

  const totalItems = remote.length; // raw records stay off the headline count — same
  let doneItems = 0; // "quiet, tiny JSON" treatment as the regular sync() above.

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

  // Download every remote Raw Memory record the same way.
  for (const item of remoteRaw) {
    const id = rawIdFromItem(item);
    if (!id) continue;
    const dl = await downloadRawRecord(graph, id);
    if (!dl) continue;
    const remoteTime = item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : nowMs();
    await vault.writeRawMemory(id, dl.content, { updatedAt: remoteTime });
    try {
      // pages (a Journal batch's photos) AND media (a package's recordings/photos).
      const parsed = JSON.parse(dl.content) as { pages?: unknown; media?: unknown };
      for (const list of [parsed.pages, parsed.media]) {
        if (Array.isArray(list)) for (const ref of list) if (typeof ref === "string") restoredMediaRefs.add(ref);
      }
    } catch {
      log.error("sync", "raw.restore.parse-error", { id });
    }
    state.raw![id] = {
      id,
      remoteId: item.id,
      cTag: dl.item.cTag ?? item.cTag ?? "",
      localUpdatedAt: remoteTime,
      syncedAt: nowMs(),
    };
    result.pulledRaw.push(id);
  }

  // Drop every local note/raw record the cloud doesn't have — this is a mirror, not a merge.
  for (const info of await vault.listNotes()) {
    if (remoteIds.has(info.id)) continue;
    await vault.deleteNote(info.id);
    result.pulledDeletes.push(info.id);
  }
  for (const info of await vault.listRawMemories()) {
    if (remoteRawIds.has(info.id)) continue;
    await vault.deleteRawMemory(info.id);
    result.pulledRawDeletes.push(info.id);
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
    pulledRaw: result.pulledRaw.length,
    deletedRawLocal: result.pulledRawDeletes.length,
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
  /** Discard this device's edits on a conflicted note and take the remote's copy. */
  keepRemote(noteId: string): Promise<void>;
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
    keepRemote: (noteId: string) => resolveKeepRemote(graph, vault, noteId),
    async info() {
      const [account, quota] = await Promise.all([getAccount(graph), getQuota(graph)]);
      return { account, quota };
    },
  };
}
