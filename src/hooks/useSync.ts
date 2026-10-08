import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "../lib/store";
import { createEngine } from "../lib/sync/engine";
import type { SyncConflict } from "../lib/sync/engine";
import { connectOneDrive, disconnectOneDrive } from "../lib/sync/connect";
import { isConnected } from "../lib/sync/tokens";
import { tauriVault } from "../lib/sync/vault";
import { ReconnectNeededError, TransientSyncError } from "../lib/sync/types";
import { log } from "../lib/logger";

// The sync surface's state machine. "unavailable" off the native app (sync is a
// desktop capability); otherwise the connection + last-sync + conflict status.
export type SyncPhase =
  | "unavailable"
  | "disconnected"
  | "idle"
  | "syncing"
  | "synced"
  | "error"
  | "conflicts";

/** Why a sync failed — so the UI tells the truth instead of always saying
 *  "sign-in expired". `expired` = reconnect; `offline` = temporary, try again;
 *  `other` = a real error, shown verbatim. */
export type SyncErrorKind = "expired" | "offline" | "other";

export interface SyncUi {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  conflicts: SyncConflict[];
  error: string | null;
  errorKind: SyncErrorKind | null;
}

/** Owns OneDrive connection + sync state. `onChanged` is called after a sync that
 *  pulled/removed notes, so the app can refresh its list. */
export function useSync(onChanged?: () => void) {
  const [ui, setUi] = useState<SyncUi>({
    phase: isTauri() ? "disconnected" : "unavailable",
    lastSyncedAt: null,
    conflicts: [],
    error: null,
    errorKind: null,
  });
  const busy = useRef(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // On mount (native only): are we connected, and when did we last sync?
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void (async () => {
      const connected = await isConnected();
      if (!alive) return;
      if (!connected) {
        setUi((u) => ({ ...u, phase: "disconnected" }));
        return;
      }
      let lastSyncedAt: number | null = null;
      try {
        lastSyncedAt = (await tauriVault().readState()).lastSyncedAt;
      } catch {
        /* no state yet */
      }
      if (!alive) return;
      setUi((u) => ({ ...u, phase: "idle", lastSyncedAt }));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const syncNow = useCallback(async () => {
    if (!isTauri() || busy.current) return;
    busy.current = true;
    setUi((u) => ({ ...u, phase: "syncing", error: null, errorKind: null }));
    try {
      const result = await createEngine().run();
      const touchedLocal =
        result.pulled.length > 0 || result.pulledDeletes.length > 0;
      if (touchedLocal) onChangedRef.current?.();
      setUi({
        phase: result.conflicts.length > 0 ? "conflicts" : "synced",
        lastSyncedAt: result.lastSyncedAt,
        conflicts: result.conflicts,
        error: null,
        errorKind: null,
      });
    } catch (e) {
      // Tell the truth about why it failed — don't paint every error as expired.
      if (e instanceof ReconnectNeededError) {
        setUi((u) => ({ ...u, phase: "error", errorKind: "expired", error: e.message }));
      } else if (e instanceof TransientSyncError) {
        setUi((u) => ({ ...u, phase: "error", errorKind: "offline", error: e.message }));
      } else {
        log.error("sync", "sync.failed", { error: String(e) });
        setUi((u) => ({
          ...u,
          phase: "error",
          errorKind: "other",
          error: String(e instanceof Error ? e.message : e),
        }));
      }
    } finally {
      busy.current = false;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!isTauri() || busy.current) return;
    busy.current = true;
    setUi((u) => ({ ...u, phase: "syncing", error: null, errorKind: null }));
    try {
      await connectOneDrive();
      busy.current = false;
      await syncNow(); // first sync right after connecting
    } catch (e) {
      log.error("sync", "connect.failed", { error: String(e) });
      setUi((u) => ({
        ...u,
        phase: "disconnected",
        error: String(e instanceof Error ? e.message : e),
        errorKind: null,
      }));
      busy.current = false;
    }
  }, [syncNow]);

  const disconnect = useCallback(async () => {
    if (!isTauri()) return;
    await disconnectOneDrive();
    setUi({ phase: "disconnected", lastSyncedAt: null, conflicts: [], error: null, errorKind: null });
  }, []);

  // Resolve a both-changed conflict by keeping this device's copy, then re-sync so
  // it propagates (replacing the other device's version — the owner's choice).
  const keepLocal = useCallback(
    async (noteId: string) => {
      if (!isTauri() || busy.current) return;
      try {
        await createEngine().keepLocal(noteId);
      } catch (e) {
        log.error("sync", "keepLocal.failed", { noteId, error: String(e) });
      }
      await syncNow();
    },
    [syncNow],
  );

  return { ui, connect, disconnect, syncNow, keepLocal };
}
