// syncMachine.ts — a pure (state, event) => state reducer for the Sync wact's states.
//
// Ported from 01-the-wand-v2.html ~lines 1451-1508 (`markDirty`, `setSync`,
// `castSpell`, the `online`/`offline` listeners). States reflect the REAL device
// state (online/offline) plus unsaved edits:
//   synced   — nothing to do
//   reminder — edited since the last back-up
//   syncing  — the cast is running
//   failed   — the last cast didn't finish
//   offline  — no connection (navigator.onLine)
//
// STRIPPED from the port on purpose: the prototype's fault injection (`FAIL_RATE`,
// `demoForceFail`) that force-fails the first cast of a session to show off the
// red state on device. A real caller decides SYNC_SUCCEEDED vs SYNC_FAILED from
// the actual backup result, not a dice roll.

export type SyncStatus = "synced" | "reminder" | "syncing" | "failed" | "offline";

/** Why the last cast failed — determines the panel's copy AND its primary action.
 *  "reconnect" is the one case where "Try again" can never succeed: the sign-in
 *  itself is dead, so the primary button must trigger reconnect instead of retry. */
export type SyncFailReason = "reconnect" | "transient" | "error";

export interface SyncState {
  status: SyncStatus;
  /** Unsaved edits exist since the last successful back-up. */
  dirty: boolean;
  /** Real device connectivity (navigator.onLine in the original). */
  online: boolean;
  /** Only meaningful while status === "failed". */
  failReason?: SyncFailReason;
  failMessage?: string;
}

export type SyncEvent =
  /** The note editor made an edit. Source ~1466 (`markDirty`). */
  | { type: "EDIT" }
  /** User tapped Sync (or the panel's primary button) while online. Source ~1483,
   *  1491-1492 (`syncTap`/`castSpell`'s guard). */
  | { type: "CAST" }
  /** The in-flight cast finished successfully. Source ~1503-1507 (else branch). */
  | { type: "SYNC_SUCCEEDED" }
  /** The in-flight cast failed. Source ~1503-1507 (if branch) — stays dirty so a
   *  retry is still offered. Carries WHY it failed so the panel can tell a dead
   *  sign-in (must reconnect) apart from a network blip (just retry). */
  | { type: "SYNC_FAILED"; reason: SyncFailReason; message?: string }
  /** `window.addEventListener("online", ...)`, source ~1488. */
  | { type: "WENT_ONLINE" }
  /** `window.addEventListener("offline", ...)`, source ~1489. */
  | { type: "WENT_OFFLINE" };

/** The machine's starting state for a given connectivity. */
export function initialSyncState(online: boolean): SyncState {
  return { status: online ? "synced" : "offline", dirty: false, online };
}

export function syncReducer(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case "EDIT": {
      // markDirty(): dirty=true; if(syncState!=="syncing" && syncState!=="offline") setSync("reminder");
      if (state.status !== "syncing" && state.status !== "offline") {
        return { ...state, dirty: true, status: "reminder" };
      }
      return { ...state, dirty: true };
    }
    case "CAST": {
      // castSpell(): if(syncState==="syncing" || syncState==="offline") return; setSync("syncing");
      if (state.status === "syncing" || state.status === "offline") return state;
      return { ...state, status: "syncing", failReason: undefined, failMessage: undefined };
    }
    case "SYNC_SUCCEEDED": {
      // dirty=false; setSync(navigator.onLine ? "synced" : "offline");
      return { ...state, dirty: false, status: state.online ? "synced" : "offline", failReason: undefined, failMessage: undefined };
    }
    case "SYNC_FAILED": {
      // setSync("failed") — stays dirty, tap sync to retry (or reconnect, see reason).
      return { ...state, status: "failed", failReason: event.reason, failMessage: event.message };
    }
    case "WENT_ONLINE": {
      // setSync(dirty ? "reminder" : "synced");
      return { ...state, online: true, status: state.dirty ? "reminder" : "synced" };
    }
    case "WENT_OFFLINE": {
      return { ...state, online: false, status: "offline" };
    }
  }
}
