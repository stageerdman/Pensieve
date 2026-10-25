// types.ts — shared sync domain types, mirroring the relevant subset of
// src/lib/sync/types.ts (the model: OneDrive is a dumb mirror; our code owns
// merge/conflict detection; one remote `.md` per note under a single app folder).

/** A remote file as Graph reports it (the fields we actually use). */
export interface RemoteItem {
  id: string;
  name: string;
  eTag?: string;
  /** Changes on CONTENT change specifically — the right tag for If-Match on a
   *  content PUT. */
  cTag?: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: unknown;
  deleted?: unknown;
  parentReference?: { path?: string };
}

/** Per-note sync bookkeeping: the remote identity + the tag we last saw. */
export interface NoteSyncRecord {
  id: string;
  remoteId: string;
  cTag: string;
  localUpdatedAt: number;
  syncedAt: number;
}

/** Per-media backup bookkeeping. Media is content-addressed by its stable ref, so
 *  there's no cTag: a recorded `backedUp` ref is done. */
export interface MediaSyncRecord {
  ref: string;
  remoteId?: string;
  backedUp: boolean;
  failedAt?: number;
}

export interface SyncState {
  /** The /delta cursor (@odata.deltaLink) — resume incremental pulls from here. */
  deltaLink: string | null;
  notes: Record<string, NoteSyncRecord>;
  media?: Record<string, MediaSyncRecord>;
  lastSyncedAt: number | null;
}

export const EMPTY_SYNC_STATE: SyncState = { deltaLink: null, notes: {}, media: {}, lastSyncedAt: null };

export interface SyncAccount {
  email: string;
  displayName?: string;
}

export interface SyncQuota {
  usedBytes: number;
  totalBytes: number;
}

export type ConflictReason = "both-changed" | "push-rejected" | "delete-rejected";

export interface SyncConflict {
  noteId: string;
  reason: ConflictReason;
  localUpdatedAt?: number;
  remoteUpdatedAt?: number;
}

export interface SyncProgress {
  direction: "down" | "up";
  name: string;
  doneItems: number;
  totalItems: number;
  bytes?: number;
}

export interface SyncResult {
  pulled: string[];
  pushed: string[];
  pulledDeletes: string[];
  pushedDeletes: string[];
  pushedMedia: string[];
  pulledMedia: string[];
  conflicts: SyncConflict[];
  lastSyncedAt: number;
}
