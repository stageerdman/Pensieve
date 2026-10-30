// useOneDriveSync.ts — owns the real OneDrive connection + drives the sync engine.
//
// Deliberately separate from useSyncState (lib/wand/syncMachine): that hook owns
// the pure (status, dirty, online) reducer the Sync UI renders from; this hook is
// what actually DOES the work (connect/disconnect/run/restore) and reports back
// success/failure for the caller to feed into that reducer. Mirrors the split
// already proven on desktop (useSync owns connection; the engine does the work).

import { useCallback, useEffect, useRef, useState } from "react";
import { disconnectOneDrive, startConnect } from "../lib/sync/connect";
import { createEngine } from "../lib/sync/engine";
import { ReconnectNeededError, RemoteRootMissingError, TransientSyncError } from "../lib/sync/errors";
import { isConnected } from "../lib/sync/tokens";
import { phoneVault } from "../lib/sync/vault";
import { log } from "../lib/logger";
import type { SyncFailReason } from "../lib/wand/syncMachine";

export interface SyncOutcome {
  ok: boolean;
  message: string;
  /** Only set when !ok — which kind of failure, so the UI can offer the right
   *  recovery action instead of a "Try again" that can never succeed. */
  reason?: SyncFailReason;
}

/** Map a thrown sync error to the UI-facing reason + message. Typed errors (see
 *  lib/sync/errors.ts) already know whether this is "sign in again" vs. "just
 *  retry" — this is the one place that distinction must survive to the screen. */
function describeFailure(e: unknown): { reason: SyncFailReason; message: string } {
  if (e instanceof ReconnectNeededError) return { reason: "reconnect", message: e.message };
  if (e instanceof TransientSyncError) return { reason: "transient", message: e.message };
  return { reason: "error", message: e instanceof Error ? e.message : "Couldn't reach the cloud" };
}

export interface OneDriveSync {
  connected: boolean;
  account: string;
  connect: () => void;
  disconnect: () => void;
  run: () => Promise<SyncOutcome>;
  restore: () => Promise<SyncOutcome>;
}

/** `onChanged` is called after a sync that may have pulled/removed notes, so the
 *  caller can refresh its in-memory copy of the vault from storage. */
export function useOneDriveSync(onChanged?: () => void): OneDriveSync {
  const [connected, setConnected] = useState(() => isConnected());
  const [account, setAccount] = useState("");
  const engineRef = useRef(createEngine(phoneVault()));
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    if (!connected) {
      setAccount("");
      return;
    }
    let alive = true;
    void engineRef.current
      .info()
      .then(({ account: a }) => {
        if (alive) setAccount(a.displayName || a.email || "");
      })
      .catch((e: unknown) => log.debug("sync", "info.failed", { error: String(e) }));
    return () => {
      alive = false;
    };
  }, [connected]);

  const connect = useCallback(() => {
    void startConnect();
  }, []);

  const disconnect = useCallback(() => {
    disconnectOneDrive();
    setConnected(false);
  }, []);

  const run = useCallback(async (): Promise<SyncOutcome> => {
    try {
      await engineRef.current.run();
      onChangedRef.current?.();
      return { ok: true, message: "All memories safe · just now" };
    } catch (e) {
      if (e instanceof RemoteRootMissingError) {
        // First-ever connect to a OneDrive with no Pensieve folder yet — set it up
        // and run the first real sync in the same cast (see summon's own docs for
        // why this is never done silently on desktop: here, the owner just drove an
        // explicit Connect + Back up, which already is that confirmation).
        try {
          await engineRef.current.summon();
          onChangedRef.current?.();
          return { ok: true, message: "Pensieve is set up · all memories safe" };
        } catch (e2) {
          log.error("sync", "summon.failed", { error: String(e2) });
          return { ok: false, message: "Couldn't set up Pensieve on this OneDrive", reason: "error" };
        }
      }
      const { reason, message } = describeFailure(e);
      log.error("sync", "run.failed", { error: String(e), reason });
      return { ok: false, message, reason };
    }
  }, []);

  const restore = useCallback(async (): Promise<SyncOutcome> => {
    try {
      await engineRef.current.restore();
      onChangedRef.current?.();
      return { ok: true, message: "Restored from the cloud · just now" };
    } catch (e) {
      const { reason, message } = describeFailure(e);
      log.error("sync", "restore.failed", { error: String(e), reason });
      return { ok: false, message, reason };
    }
  }, []);

  return { connected, account, connect, disconnect, run, restore };
}
