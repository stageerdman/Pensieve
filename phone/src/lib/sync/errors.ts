// errors.ts — the sync layer's typed failures, mirroring src/lib/sync/types.ts's
// error classes so the same UI-copy logic (expired vs transient vs real error) can
// apply on the phone. Re-implemented, not imported — see noteFormat.ts's header.

/** The remote moved on since our last sync — refuse the write so nothing is
 *  silently clobbered (the single-writer guarantee). */
export class ConflictError extends Error {
  constructor(public noteId: string) {
    super(`Note ${noteId} was edited elsewhere — re-sync before editing.`);
    this.name = "ConflictError";
  }
}

/** No refresh token, or the stored one was genuinely revoked/expired
 *  (`invalid_grant`) — the ONLY case that means "sign in again". */
export class ReconnectNeededError extends Error {
  constructor(message = "OneDrive is not connected.") {
    super(message);
    this.name = "ReconnectNeededError";
  }
}

/** A temporary failure — no network, a 5xx, a timeout. The sign-in is still valid. */
export class TransientSyncError extends Error {
  constructor(message = "Can't reach OneDrive right now.") {
    super(message);
    this.name = "TransientSyncError";
  }
}

/** The signed-in OneDrive has no Pensieve folder yet — sync is blocked until the
 *  owner explicitly "Summons" it (never auto-created, in case the wrong account
 *  got picked). */
export class RemoteRootMissingError extends Error {
  constructor(message = "Pensieve isn't set up on this OneDrive yet.") {
    super(message);
    this.name = "RemoteRootMissingError";
  }
}
