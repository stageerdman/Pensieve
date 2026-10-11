// useSyncState.ts — wraps the pure syncMachine with live connectivity.
//
// Ported from 01-the-wand-v2.html ~1460-1489: the state reflects the REAL device
// state (navigator.onLine) plus unsaved edits. This hook owns the reducer + the
// window online/offline listeners; the cast visuals (spell overlay) and the panel
// live in the components/app. The prototype's FAIL_RATE/demoForceFail fault-injection
// is intentionally NOT here (stripped in syncMachine) — the caller decides success.

import { useEffect, useReducer } from "react";
import { initialSyncState, syncReducer, type SyncEvent, type SyncState } from "../lib/wand/syncMachine";

export interface SyncApi {
  state: SyncState;
  /** Mark the vault dirty (an edit happened). */
  edit: () => void;
  /** Begin a cast (guarded: no-op while syncing/offline). */
  cast: () => void;
  succeeded: () => void;
  failed: () => void;
}

export function useSyncState(): SyncApi {
  const [state, dispatch] = useReducer(
    syncReducer,
    typeof navigator !== "undefined" ? navigator.onLine : true,
    initialSyncState,
  );

  useEffect(() => {
    const online = () => dispatch({ type: "WENT_ONLINE" });
    const offline = () => dispatch({ type: "WENT_OFFLINE" });
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const fire = (type: SyncEvent["type"]) => dispatch({ type } as SyncEvent);
  return {
    state,
    edit: () => fire("EDIT"),
    cast: () => fire("CAST"),
    succeeded: () => fire("SYNC_SUCCEEDED"),
    failed: () => fire("SYNC_FAILED"),
  };
}
