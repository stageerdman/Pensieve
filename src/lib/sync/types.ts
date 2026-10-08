// Shared types for the OneDrive sync spine. The model is deliberately simple
// (see the update doc): OneDrive is a dumb mirror of the vault; our code owns
// merge/conflict detection. One remote `.md` per note under a single app folder.

/** Azure app registration + endpoints. Loaded from the OS keychain on desktop. */
export interface AzureConfig {
  clientId: string;
  /** Confidential "Web" app → secret required for the code exchange (we also send
   *  PKCE). Empty string means "public client, no secret" (the PWA's future path). */
  clientSecret: string;
  /** Registered redirect, e.g. http://localhost:3000/api/auth/callback. */
  redirectUri: string;
  /** "consumers" for personal Microsoft accounts. */
  tenant: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/** A remote file as Graph reports it (the fields we actually use). */
export interface RemoteItem {
  id: string;
  name: string;
  /** Changes on any change (metadata or content). */
  eTag?: string;
  /** Changes on CONTENT change specifically — the right tag for If-Match on a
   *  content PUT (proven in the Phase 0 spike). */
  cTag?: string;
  size?: number;
  lastModifiedDateTime?: string;
  /** Present on folders; lets the delta reader skip structural entries. */
  folder?: unknown;
  /** Present on deletions in a /delta page. */
  deleted?: unknown;
  parentReference?: { path?: string };
}

/** Per-note sync bookkeeping: the remote identity + the tag we last saw. The
 *  single-writer guard compares our stored cTag against the remote before writing. */
export interface NoteSyncRecord {
  /** Local note id (the .md basename). */
  id: string;
  /** Graph item id of the remote .md (stable across edits). */
  remoteId: string;
  /** cTag at our last successful sync of this note — the If-Match value. */
  cTag: string;
  /** The note's local `updatedAt` at our last sync. "Did it change locally since?"
   *  compares the current updatedAt against this — same clock source as updatedAt,
   *  so it's immune to wall-clock skew between devices/readings. */
  localUpdatedAt: number;
  /** Last time we pulled/pushed this note (epoch ms), for display. */
  syncedAt: number;
}

/** The signed-in OneDrive account (from Graph /me) — shown in the sync panel so
 *  the owner can confirm which account their thoughts back up to. */
export interface SyncAccount {
  email: string;
  displayName?: string;
}

/** Drive storage, in bytes (from Graph /me/drive quota). */
export interface SyncQuota {
  usedBytes: number;
  totalBytes: number;
}

/** A live snapshot of what's transferring right now, emitted by the engine as it
 *  works so the panel can show "3 of 12 · morning-pages.md" and fill the flask.
 *  Item count is the headline; `bytes` is the current item's size, shown only as a
 *  quiet tail when a big media file dominates. */
export interface SyncProgress {
  /** down = pulling from OneDrive, up = pushing to it. */
  direction: "down" | "up";
  /** The note id / file name currently being transferred. */
  name: string;
  /** How many items are done (this item is `doneItems + 1` of `totalItems`). */
  doneItems: number;
  totalItems: number;
  /** Size of the current item in bytes, if known. */
  bytes?: number;
}

/** The whole sync state, persisted beside the vault (not a note). */
export interface SyncState {
  /** The /delta cursor (@odata.deltaLink) — resume incremental pulls from here. */
  deltaLink: string | null;
  /** Per-note records keyed by local id. */
  notes: Record<string, NoteSyncRecord>;
  /** Last full sync (epoch ms). */
  lastSyncedAt: number | null;
}

export const EMPTY_SYNC_STATE: SyncState = {
  deltaLink: null,
  notes: {},
  lastSyncedAt: null,
};

/** Thrown when the remote moved on since our last sync — the write is refused so
 *  nothing is silently clobbered (the single-writer guarantee). */
export class ConflictError extends Error {
  constructor(public noteId: string) {
    super(`Note ${noteId} was edited elsewhere — re-sync before editing.`);
    this.name = "ConflictError";
  }
}

/** Thrown when there is no valid refresh token, or the stored one was revoked /
 *  expired (Microsoft `invalid_grant`). The ONLY case that genuinely means
 *  "sign in again" — caller shows Connect / Reconnect. */
export class ReconnectNeededError extends Error {
  constructor(message = "OneDrive is not connected.") {
    super(message);
    this.name = "ReconnectNeededError";
  }
}

/** Thrown for a *temporary* failure — no network, a token/Graph 5xx, a timeout.
 *  The sign-in is still valid; the right UX is "can't reach OneDrive, try again",
 *  never "sign-in expired". Distinguishing this from ReconnectNeeded is what stops
 *  every transient hiccup from masquerading as an expired login. */
export class TransientSyncError extends Error {
  constructor(message = "Can't reach OneDrive right now.") {
    super(message);
    this.name = "TransientSyncError";
  }
}

/** Thrown when the signed-in OneDrive has no Pensieve folder yet. Sync is blocked
 *  until the owner explicitly "Summons" Pensieve there — we never silently create the
 *  folder on an account the user may have picked by mistake. The UI shows a one-click
 *  "Summon Pensieve" action and an attention status until then. */
export class RemoteRootMissingError extends Error {
  constructor(message = "Pensieve isn't set up on this OneDrive yet.") {
    super(message);
    this.name = "RemoteRootMissingError";
  }
}

/** A failure from the OAuth token endpoint, carrying the HTTP status and the
 *  Microsoft error code (e.g. `invalid_grant`, `invalid_client`) so callers can
 *  tell an expired login from a config problem from a transient 5xx. */
export class TokenError extends Error {
  constructor(
    public status: number,
    public code: string,
    public description: string,
  ) {
    super(`Token request failed (${status}): ${code}${description ? ` — ${description}` : ""}`);
    this.name = "TokenError";
  }
}
