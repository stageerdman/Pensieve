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
  deleteRawRecord,
  downloadMedia,
  downloadNote,
  downloadRawRecord,
  getAccount,
  getQuota,
  listNotes,
  listRawRecords,
  mediaContentType,
  noteIdFromName,
  rawIdFromItem,
  remoteRootExists,
  uploadMedia,
  uploadNote,
  uploadRawRecord,
  downloadNotesIndex,
} from "./adapter";
import { ConflictError, RemoteRootMissingError } from "./errors";
import { inWindow, parseNotesIndex, planBringIn, planForget, planForgetMedia, type WindowCtx } from "./window";
import { EMPTY_SYNC_STATE, type MediaSyncRecord, type RemoteItem, type SyncAccount, type SyncProgress, type SyncQuota, type SyncResult, type SyncState } from "./types";
import { getAccessToken, clearTokenCache } from "./tokens";
import { parseNoteContent } from "../media/noteMedia";
import { isMediaPath } from "../media/noteMedia";
import { transcriptRefFor } from "../media/transcript";
import { log } from "../logger";
import { setRemoteMediaFetcher } from "../media/mediaStore";

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
    } else if (block.kind === "video" && isMediaPath(block.ref)) {
      // Videos were never listed here, so the phone didn't know a note's video existed
      // (and would re-upload one fetched on demand). The bytes themselves are on-demand
      // (isOnDemandMedia) — listing the ref marks it as the remote's, not to download now.
      refs.push(block.ref);
      refs.push(transcriptRefFor(block.ref));
    } else if (block.kind === "journal") {
      // Every processed journal page has its own photo AND its own transcript sidecar
      // (processRawBatch.ts writes one per page) — without this branch at all, a journal
      // block's refs were never recognised here, so no bytes for its photos ever reached
      // this device: the note synced, but every page showed broken/missing (a real bug
      // found 2026-11-10, not a hypothetical one — unlike gallery/audio, this one was
      // simply never added when the journal block itself was built).
      for (const page of block.pages) {
        if (!isMediaPath(page.ref)) continue;
        refs.push(page.ref);
        refs.push(transcriptRefFor(page.ref));
      }
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
  pulledRaw: [],
  pushedRaw: [],
  pulledRawDeletes: [],
  pushedRawDeletes: [],
  conflicts: [],
  lastSyncedAt: 0,
});

const ON_DEMAND_EXT = new Set(["mp4", "mov", "m4v", "webm", "m4a", "mp3", "wav", "aac", "ogg", "oga", "opus", "caf"]);

/** Video/audio binaries — downloaded when played, not during sync (they can be huge).
 *  Transcript sidecars (`….json`) and images are still pulled eagerly. */
export function isOnDemandMedia(ref: string): boolean {
  const ext = ref.split(".").pop()?.toLowerCase() ?? "";
  return ON_DEMAND_EXT.has(ext);
}

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
    if (isOnDemandMedia(ref)) {
      // Video/audio is fetched when played (mediaStore.setRemoteMediaFetcher), not here.
      // It came from the remote, so record it as backed up — fetching it later must never
      // trigger a re-upload from the phone.
      media[ref] ??= { ref, backedUp: true };
      continue;
    }
    try {
      const bytes = await downloadMedia(graph, ref);
      if (!bytes) {
        // Not on the remote (yet) — the other device may still be uploading it. A later
        // sync retries; logged so a downstream "file not found" is explainable.
        log.warn("sync", "media.pull.not-on-remote", { ref });
        continue;
      }
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
/** Thrown instead of syncing when the local vault did not load fully (FAST-LOAD guard). */
export class VaultNotReadyError extends Error {
  constructor() {
    super("Your notes did not finish loading on this phone — sync paused to keep OneDrive safe. Close and reopen the app.");
    this.name = "VaultNotReadyError";
  }
}

/** A deletion pass that would remove more than this many notes AND this share of every note
 *  ever synced is refused: no real session deletes hundreds of notes on a phone, but an empty
 *  or half-loaded local vault looks exactly like that. */
export const MASS_DELETE_MIN = 10;
export const MASS_DELETE_SHARE = 0.2;

/** PHONE-WINDOW: load the rolling-window context — the desktop's notes index (refreshed
 *  when its cTag changed) + this phone's open log. null = no index → no window: the phone
 *  mirrors everything, exactly as before. A network hiccup keeps the cached index. */
async function loadWindow(graph: GraphClient, vault: LocalVault, state: SyncState): Promise<WindowCtx | null> {
  if (!vault.readNotesIndex || !vault.writeNotesIndex) return null;
  let entries = await vault.readNotesIndex();
  try {
    const got = await downloadNotesIndex(graph, entries ? state.notesIndexCTag : undefined);
    if (got === null) {
      entries = null; // never published (desktop not updated yet) → no window
    } else if (got !== "unchanged") {
      const parsed = parseNotesIndex(got.json);
      if (parsed) {
        entries = parsed;
        await vault.writeNotesIndex(parsed);
        state.notesIndexCTag = got.cTag;
      }
    }
  } catch (e) {
    log.warn("sync", "window.index.fetch-failed", { error: String(e), cached: !!entries });
  }
  if (!entries) return null;
  return { now: nowMs(), index: new Map(entries.map((e) => [e.id, e])), opens: (await vault.readOpens?.()) ?? {} };
}

/** Media refs a Raw Memory batch holds (journal pages + package media). */
function rawMediaRefs(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as { pages?: unknown; media?: unknown };
    const out: string[] = [];
    for (const list of [parsed.pages, parsed.media]) {
      if (Array.isArray(list)) for (const ref of list) if (typeof ref === "string") out.push(ref);
    }
    return out;
  } catch {
    return [];
  }
}

/** PHONE-WINDOW: forget (locally only) the clean memories outside the window, and free
 *  media only they used. Crash-safe ORDER: the records are flagged remoteOnly and the state
 *  is persisted BEFORE anything is removed — a crash in between leaves a local note with a
 *  remoteOnly record, which the next sync normalizes back (see sync()). Never touches the
 *  remote. */
async function forgetOutsideWindow(vault: LocalVault, state: SyncState, win: WindowCtx, protect: ReadonlySet<string>): Promise<string[]> {
  const local = await vault.listNotes();
  const forget = planForget(local, state.notes, win, protect);
  if (!forget.length) return [];
  const forgetSet = new Set(forget);
  const keptRefs = new Set<string>();
  const forgottenRefs: string[] = [];
  for (const n of local) {
    const content = await vault.readNote(n.id);
    if (content === null) continue;
    const refs = extractMediaRefs(content);
    if (forgetSet.has(n.id)) forgottenRefs.push(...refs);
    else for (const r of refs) keptRefs.add(r);
  }
  for (const r of await vault.listRawMemories()) {
    const content = await vault.readRawMemory(r.id);
    if (content) for (const ref of rawMediaRefs(content)) keptRefs.add(ref);
  }
  for (const id of forget) state.notes[id] = { ...state.notes[id], remoteOnly: true };
  await vault.writeState(state); // ← before any removal (crash-safe)
  for (const id of forget) await vault.deleteNote(id);
  const media = planForgetMedia(forgottenRefs, keptRefs, (ref) => !!state.media?.[ref]?.backedUp);
  if (vault.deleteMedia) for (const ref of media) await vault.deleteMedia(ref);
  log.info("sync", "window.forgot", { notes: forget.length, media: media.length, kept: local.length - forget.length });
  return forget;
}

export interface SyncOptions {
  /** PHONE-WINDOW: also forget clean memories outside the window (run once per app
   *  session, at launch — never while the owner is scrolling). */
  forget?: boolean;
  /** Never forget these (e.g. the memory on screen). */
  protect?: string[];
}

export async function sync(graph: GraphClient, vault: LocalVault, onProgress?: (p: SyncProgress) => void, opts: SyncOptions = {}): Promise<SyncResult> {
  if (vault.isReady && !vault.isReady()) {
    log.warn("sync", "refused.vault-not-ready", {});
    throw new VaultNotReadyError();
  }
  if (!(await remoteRootExists(graph))) throw new RemoteRootMissingError();
  const state: SyncState = await vault.readState();
  if (!state.notes) state.notes = {};
  if (!state.media) state.media = {};
  if (!state.raw) state.raw = {};
  const result = emptyResult();

  // ---------- PHONE-WINDOW ----------
  const win = await loadWindow(graph, vault, state);

  // ---------- PULL: classify ----------
  const { items, deltaLink } = await delta(graph, state.deltaLink);
  const localBefore = new Map((await vault.listNotes()).map((n) => [n.id, n.updatedAt]));
  // A remoteOnly record whose note IS here (a crash between forget's state write and its
  // removal, or a fetch-on-tap) is just a normal record again — so a later phone-side
  // delete of it propagates, and forget can retry it.
  for (const id of localBefore.keys()) if (state.notes[id]?.remoteOnly) delete state.notes[id].remoteOnly;
  const rawLocalBefore = new Map((await vault.listRawMemories()).map((n) => [n.id, n.updatedAt]));
  const conflicted = new Set<string>();
  const localDeletes: string[] = [];
  const downloads: { id: string; item: RemoteItem }[] = [];
  // Raw Memory batches: own id-space, no conflict-resolution UI (single-writer in
  // practice — the phone creates/edits, desktop only transitions status or deletes),
  // so a genuine both-changed case is just left for the next sync to re-evaluate.
  const rawConflicted = new Set<string>();
  const rawLocalDeletes: string[] = [];
  const rawDownloads: { id: string; item: RemoteItem }[] = [];

  for (const item of items) {
    if (item.folder) continue;
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

      // PHONE-WINDOW: a memory not on the phone and outside the window is only noted as
      // existing remotely — never downloaded. (A live record missing locally is a pending
      // phone-side delete, handled as before.)
      if (win && !localBefore.has(id) && (!rec || rec.remoteOnly) && !inWindow(id, win)) {
        state.notes[id] = { id, remoteId: item.id, cTag: rec?.cTag ?? "", localUpdatedAt: 0, syncedAt: rec?.syncedAt ?? 0, remoteOnly: true };
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
      continue;
    }

    // Not a note — a Raw Memory record? Recognised by parent-path, not name suffix.
    let rawId = rawIdFromItem(item);
    if (!rawId && item.deleted) {
      rawId = Object.keys(state.raw).find((k) => state.raw![k].remoteId === item.id) ?? null;
    }
    if (!rawId) continue;

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

  // PHONE-WINDOW bring-in: memories that entered the window (opened at the computer, or
  // newly created there) but aren't here — the delta alone won't re-surface those.
  if (win) {
    const queued = new Set(downloads.map((d) => d.id));
    for (const id of planBringIn(new Set(localBefore.keys()), state.notes, win)) {
      if (queued.has(id) || conflicted.has(id) || localDeletes.includes(id)) continue;
      downloads.push({ id, item: { id: state.notes[id]?.remoteId ?? "", name: `${id}.md` } as RemoteItem });
    }
  }

  // ---------- RAW RECONCILIATION (defensive) ----------
  // A delta tombstone for a raw record can be missed: confirmed against a REAL OneDrive
  // account (2026-11-10) that a deleted item's tombstone carries NO `name` and NO
  // `parentReference.path` at all, so recognition falls entirely on the remoteId
  // fallback above — and on a real device that fallback missed once, leaving a
  // desktop-deleted batch sitting on this phone forever and getting RE-UPLOADED as a
  // stray duplicate. Raw batches are few and short-lived, so independently verifying
  // against the actual raw/ folder listing here is cheap insurance against whatever
  // caused the miss.
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
  // Orphan adoption: a record on the remote this device has never synced and doesn't hold
  // — e.g. one the pre-fix listing bug (above) deleted locally, after which the delta never
  // re-sends it because the remote copy didn't change. Pull it. (A record still in
  // state.raw but missing locally is a pending LOCAL delete — never re-adopted.)
  const rawQueued = new Set(rawDownloads.map((d) => d.id));
  for (const item of remoteRawNow) {
    const id = rawIdFromItem(item);
    if (!id || state.raw[id] || rawLocalBefore.has(id) || rawQueued.has(id)) continue;
    // A memory with this id exists = a package the desktop already resolved (its remote
    // leftover is the desktop's to delete) — don't resurrect it here.
    if (localBefore.has(id) || state.notes[id]) continue;
    log.info("sync", "raw.adopt", { id });
    rawDownloads.push({ id, item });
  }

  // ---------- PUSH: classify ----------
  const localNow = await vault.listNotes();
  const uploads = localNow.filter((info) => {
    if (conflicted.has(info.id)) return false;
    const rec = state.notes[info.id];
    if (rec && info.updatedAt <= rec.localUpdatedAt) return false;
    return true;
  });

  const rawLocalNow = await vault.listRawMemories();
  const rawUploads = rawLocalNow.filter((info) => {
    // A record about to be deleted (tombstone OR the reconciliation pass above) must
    // never ALSO be queued for re-upload.
    if (rawConflicted.has(info.id) || rawLocalDeletes.includes(info.id)) return false;
    const rec = state.raw![info.id];
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
  for (const id of rawLocalDeletes) {
    await vault.deleteRawMemory(id);
    delete state.raw[id];
    rawLocalBefore.delete(id);
    result.pulledRawDeletes.push(id);
  }

  const pulledMediaRefs = new Set<string>();

  for (const { id, item } of downloads) {
    emit("down", id, item.size);
    const dl = await downloadNote(graph, item.name);
    if (!dl) {
      doneItems++;
      continue;
    }
    const modified = item.lastModifiedDateTime ?? dl.item.lastModifiedDateTime;
    const remoteTime = modified ? Date.parse(modified) : nowMs();
    await vault.writeNote(id, dl.content, { updatedAt: remoteTime });
    for (const ref of extractMediaRefs(dl.content)) pulledMediaRefs.add(ref);
    state.notes[id] = { id, remoteId: item.id || dl.item.id, cTag: dl.item.cTag ?? item.cTag ?? "", localUpdatedAt: remoteTime, syncedAt: nowMs() };
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

  // Raw Memory downloads/uploads — quiet, no onProgress ticks (tiny JSON records).
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
    state.raw[id] = { id, remoteId: item.id, cTag: dl.item.cTag ?? item.cTag ?? "", localUpdatedAt: remoteTime, syncedAt: nowMs() };
    rawLocalBefore.set(id, remoteTime);
    result.pulledRaw.push(id);
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

  // ---------- RAW RECORDS → remote (AFTER media) ----------
  // A record goes up only once every binary it references is confirmed on the remote. The
  // desktop starts processing the moment a record lands, so record-before-media let it run
  // against a recording that hadn't arrived yet (2026-11-18: a 21-min WAV finished 45s after
  // its record → "audio not found"). A record whose media failed to upload waits for a later
  // sync; a ref that isn't on this phone at all has nothing to wait for and doesn't block.
  const localMediaNow = new Set(await vault.listMedia());
  for (const info of rawUploads) {
    const rec = state.raw[info.id];
    const content = await vault.readRawMemory(info.id);
    if (content === null) continue;
    const pending = rawMediaRefs(content).filter((ref) => localMediaNow.has(ref) && !state.media![ref]?.backedUp);
    if (pending.length) {
      log.info("sync", "raw.push.wait-media", { id: info.id, pending: pending.length });
      continue;
    }
    try {
      const item = await uploadRawRecord(graph, info.id, content, rec?.cTag);
      state.raw[info.id] = { id: info.id, remoteId: item.id ?? rec?.remoteId ?? "", cTag: item.cTag ?? rec?.cTag ?? "", localUpdatedAt: info.updatedAt, syncedAt: nowMs() };
      result.pushedRaw.push(info.id);
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      log.info("sync", "raw.push.conflict", { id: info.id });
    }
  }

  // ---------- LOCAL DELETIONS → remote ----------
  const liveIds = new Set((await vault.listNotes()).map((n) => n.id));
  // remoteOnly = deliberately not on this phone (PHONE-WINDOW) — its absence is NOT a delete.
  const known = Object.keys(state.notes).filter((id) => !state.notes[id].remoteOnly);
  const toDelete = known.filter((id) => !liveIds.has(id));
  const massDelete = toDelete.length > MASS_DELETE_MIN && toDelete.length > known.length * MASS_DELETE_SHARE;
  if (massDelete) log.warn("sync", "refused.mass-delete", { wouldDelete: toDelete.length, known: known.length, live: liveIds.size });
  for (const id of massDelete ? [] : toDelete) {
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

  // A Raw Memory vanishes locally in two cases, both propagating as a real remote
  // delete: the owner deleted the batch on the phone, or desktop just consumed it
  // after successfully writing the final Memories.
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

  if (win && opts.forget) result.forgotten = await forgetOutsideWindow(vault, state, win, new Set(opts.protect ?? []));

  log.info("sync", "sync.done", {
    window: win ? { indexed: win.index.size } : null,
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
  const remoteRaw = await listRawRecords(graph);
  const remoteRawIds = new Set<string>();
  for (const item of remoteRaw) {
    const id = rawIdFromItem(item);
    if (id) remoteRawIds.add(id);
  }

  const state: SyncState = { ...EMPTY_SYNC_STATE, notes: {}, media: {}, raw: {} };
  // PHONE-WINDOW: restore mirrors only the window; everything else is recorded remoteOnly.
  const win = await loadWindow(graph, vault, state);
  const wanted = remote.filter((item) => {
    const id = noteIdFromName(item.name);
    if (!id) return false;
    if (!win || inWindow(id, win)) return true;
    state.notes[id] = { id, remoteId: item.id, cTag: "", localUpdatedAt: 0, syncedAt: 0, remoteOnly: true };
    return false;
  });
  const totalItems = wanted.length;
  let doneItems = 0;
  const restoredMediaRefs = new Set<string>();

  for (const item of wanted) {
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
    state.raw![id] = { id, remoteId: item.id, cTag: dl.item.cTag ?? item.cTag ?? "", localUpdatedAt: remoteTime, syncedAt: nowMs() };
    result.pulledRaw.push(id);
  }

  for (const info of await vault.listNotes()) {
    if (remoteIds.has(info.id) && !state.notes[info.id]?.remoteOnly) continue;
    await vault.deleteNote(info.id);
    result.pulledDeletes.push(info.id);
  }
  for (const info of await vault.listRawMemories()) {
    if (remoteRawIds.has(info.id)) continue;
    await vault.deleteRawMemory(info.id);
    result.pulledRawDeletes.push(info.id);
  }

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

/** PHONE-WINDOW: bring ONE memory onto the phone on demand (Accio tap on an older memory).
 *  Returns false when it isn't on OneDrive. Throws on a network failure (caller toasts).
 *  Records the open, so it stays for the window. Its images follow via `pullMedia`. */
export async function fetchRemoteNote(graph: GraphClient, vault: LocalVault, id: string): Promise<{ ok: boolean; pullMedia: () => Promise<void> }> {
  const noop = { pullMedia: async () => {} };
  if ((await vault.readNote(id)) !== null) return { ok: true, ...noop };
  const dl = await downloadNote(graph, `${id}.md`);
  if (!dl) return { ok: false, ...noop };
  const remoteTime = dl.item.lastModifiedDateTime ? Date.parse(dl.item.lastModifiedDateTime) : nowMs();
  const state = await vault.readState();
  if (!state.media) state.media = {};
  await vault.writeNote(id, dl.content, { updatedAt: remoteTime });
  state.notes[id] = { id, remoteId: dl.item.id ?? state.notes[id]?.remoteId ?? "", cTag: dl.item.cTag ?? "", localUpdatedAt: remoteTime, syncedAt: nowMs() };
  await vault.writeState(state);
  log.info("sync", "window.fetched", { id });
  return {
    ok: true,
    pullMedia: async () => {
      const st = await vault.readState();
      if (!st.media) st.media = {};
      await pullReferencedMedia(graph, vault, extractMediaRefs(dl.content), new Set(await vault.listMedia()), st.media, emptyResult());
      await vault.writeState(st);
    },
  };
}

/** A sync engine wired to the real token provider + the phone's own vault. */
export function createEngine(vault: LocalVault): {
  run(onProgress?: (p: SyncProgress) => void, opts?: SyncOptions): Promise<SyncResult>;
  /** Bring one older memory onto the phone (see fetchRemoteNote). */
  fetchNote(id: string): Promise<boolean>;
  restore(onProgress?: (p: SyncProgress) => void): Promise<SyncResult>;
  summon(onProgress?: (p: SyncProgress) => void): Promise<SyncResult>;
  keepLocal(noteId: string): Promise<void>;
  keepRemote(noteId: string): Promise<void>;
  info(): Promise<{ account: SyncAccount; quota: SyncQuota }>;
} {
  const graph = makeGraphClient({ getToken: getAccessToken, invalidate: clearTokenCache });
  // Let the media store fetch video/audio from OneDrive the first time it's played.
  setRemoteMediaFetcher(async (ref) => {
    const bytes = await downloadMedia(graph, ref);
    return bytes ? { bytes, type: mediaContentType(ref) } : null;
  });
  // Every state-writing operation runs one at a time: a fetch-on-tap during a sync would
  // otherwise have its new record overwritten by the sync's final state write.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };
  return {
    run: (onProgress, opts) => serial(() => sync(graph, vault, onProgress, opts)),
    fetchNote: async (id) => {
      const r = await serial(() => fetchRemoteNote(graph, vault, id));
      if (r.ok) void serial(r.pullMedia).catch((e) => log.warn("sync", "window.fetch-media-failed", { id, error: String(e) }));
      return r.ok;
    },
    restore: (onProgress) => serial(() => restoreFromCloud(graph, vault, onProgress)),
    summon: (onProgress) =>
      serial(async () => {
        await createRoot(graph);
        return sync(graph, vault, onProgress);
      }),
    keepLocal: (noteId) => serial(() => resolveKeepLocal(graph, vault, noteId)),
    keepRemote: (noteId) => serial(() => resolveKeepRemote(graph, vault, noteId)),
    async info() {
      const [account, quota] = await Promise.all([getAccount(graph), getQuota(graph)]);
      return { account, quota };
    },
  };
}
