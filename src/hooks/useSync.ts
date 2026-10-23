import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "../lib/store";
import { createEngine } from "../lib/sync/engine";
import { connectOneDrive, disconnectOneDrive } from "../lib/sync/connect";
import { isConnected } from "../lib/sync/tokens";
import { tauriVault } from "../lib/sync/vault";
import { ReconnectNeededError, RemoteRootMissingError, TransientSyncError } from "../lib/sync/types";
import type { SyncProgress } from "../lib/sync/types";
import { setMediaBackupEnabled, primeMediaBackupStates } from "../lib/media";
import { log } from "../lib/logger";

// The sync UI-state types now live in the sync domain (lib/sync/types) so pure
// derivation can consume them; re-exported here for existing call sites.
import type { SyncPhase, SyncErrorKind, SyncUi } from "../lib/sync/types";
export type { SyncPhase, SyncErrorKind, SyncUi };

/** Owns OneDrive connection + sync state. `onChanged` is called after a sync that
 *  pulled/removed notes, so the app can refresh its list. */
export function useSync(onChanged?: () => void) {
  const [ui, setUi] = useState<SyncUi>({
    phase: isTauri() ? "disconnected" : "unavailable",
    lastSyncedAt: null,
    conflicts: [],
    error: null,
    errorKind: null,
    account: null,
    quota: null,
    transfer: null,
  });
  const busy = useRef(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // Conflict resolution: per-row resolving/error state, plus a tiny serial queue so
  // concurrent "keep local"/"keep remote" calls never race each other's state-file
  // read-modify-write (each resolve awaits the previous one), and a debounced
  // trailing sync chained onto that SAME queue — so it always runs strictly after
  // every queued resolution, however many were clicked in a burst.
  // The guard against double-firing the SAME row lives on a ref, not the `resolvingIds`
  // state below — two clicks on the same button can land in the same React tick
  // (before a state update commits a re-render), and a state-only guard would read
  // the same stale "not resolving yet" snapshot for both. `resolvingIds` state exists
  // purely to drive the UI (the spinner row).
  const resolvingRef = useRef<Set<string>>(new Set());
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [conflictErrors, setConflictErrors] = useState<Record<string, string>>({});
  const resolveQueue = useRef<Promise<void>>(Promise.resolve());
  const followUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (followUpTimer.current) clearTimeout(followUpTimer.current);
    },
    [],
  );

  // Account + quota for the panel. Best-effort: a failure here never changes the
  // sync phase (it's reference info, not the connection's health).
  const refreshInfo = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const { account, quota } = await createEngine().info();
      setUi((u) => ({ ...u, account, quota }));
    } catch (e) {
      log.debug("sync", "info.failed", { error: String(e) });
    }
  }, []);

  // On mount (native only): are we connected, and when did we last sync?
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void (async () => {
      const connected = await isConnected();
      if (!alive) return;
      if (!connected) {
        setMediaBackupEnabled(false);
        setUi((u) => ({ ...u, phase: "disconnected" }));
        return;
      }
      let lastSyncedAt: number | null = null;
      try {
        const state = await tauriVault().readState();
        lastSyncedAt = state.lastSyncedAt;
        // Reflect already-backed-up media in the rune store before any sync runs.
        primeMediaBackupStates(state.media);
      } catch {
        /* no state yet */
      }
      if (!alive) return;
      setMediaBackupEnabled(true); // connected → images show their backup rune
      setUi((u) => ({ ...u, phase: "idle", lastSyncedAt }));
      void refreshInfo(); // fill account + quota in the background
    })();
    return () => {
      alive = false;
    };
  }, [refreshInfo]);

  // Shared runner for both a normal sync and a summon-then-sync — same syncing/
  // success/error handling, differing only in which engine call drives the run.
  const runSync = useCallback(
    async (run: (onProgress: (p: SyncProgress) => void) => Promise<Awaited<ReturnType<ReturnType<typeof createEngine>["run"]>>>) => {
      if (!isTauri() || busy.current) return;
      busy.current = true;
      setUi((u) => ({ ...u, phase: "syncing", error: null, errorKind: null, transfer: null }));
      try {
        const onProgress = (p: SyncProgress) => setUi((u) => ({ ...u, transfer: p }));
        const result = await run(onProgress);
        const touchedLocal = result.pulled.length > 0 || result.pulledDeletes.length > 0;
        if (touchedLocal) onChangedRef.current?.();
        setUi((u) => ({
          ...u,
          phase: result.conflicts.length > 0 ? "conflicts" : "synced",
          lastSyncedAt: result.lastSyncedAt,
          conflicts: result.conflicts,
          error: null,
          errorKind: null,
          transfer: null,
        }));
        void refreshInfo(); // quota moved after a push
      } catch (e) {
        // Tell the truth about why it failed — don't paint every error as expired.
        if (e instanceof RemoteRootMissingError) {
          // Connected, but this drive has no Pensieve folder — offer "Summon Pensieve".
          setUi((u) => ({ ...u, phase: "needs-summon", error: null, errorKind: null, transfer: null }));
          void refreshInfo(); // show which account they're connected to
        } else if (e instanceof ReconnectNeededError) {
          setUi((u) => ({ ...u, phase: "error", errorKind: "expired", error: e.message, transfer: null }));
        } else if (e instanceof TransientSyncError) {
          setUi((u) => ({ ...u, phase: "error", errorKind: "offline", error: e.message, transfer: null }));
        } else {
          log.error("sync", "sync.failed", { error: String(e) });
          setUi((u) => ({
            ...u,
            phase: "error",
            errorKind: "other",
            error: String(e instanceof Error ? e.message : e),
            transfer: null,
          }));
        }
      } finally {
        busy.current = false;
      }
    },
    [refreshInfo],
  );

  const syncNow = useCallback(() => runSync((op) => createEngine().run(op)), [runSync]);

  // "Summon Pensieve": create the remote folder on this drive, then first-sync.
  const summon = useCallback(() => runSync((op) => createEngine().summon(op)), [runSync]);

  // Destructive "restore everything from cloud": overwrite this device with the cloud
  // copy, discarding local changes. Same runner as a sync (progress/success/error),
  // but the engine mirrors down instead of merging. The caller confirms first.
  const restoreFromCloud = useCallback(() => runSync((op) => createEngine().restore(op)), [runSync]);

  const connect = useCallback(async () => {
    if (!isTauri() || busy.current) return;
    busy.current = true;
    setUi((u) => ({ ...u, phase: "syncing", error: null, errorKind: null }));
    try {
      await connectOneDrive();
      setMediaBackupEnabled(true); // connected → images show their backup rune
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
    setMediaBackupEnabled(false); // no backup target → no runes
    if (followUpTimer.current) clearTimeout(followUpTimer.current);
    followUpTimer.current = null;
    resolvingRef.current = new Set();
    setResolvingIds(new Set());
    setConflictErrors({});
    setUi({
      phase: "disconnected",
      lastSyncedAt: null,
      conflicts: [],
      error: null,
      errorKind: null,
      account: null,
      quota: null,
      transfer: null,
    });
  }, []);

  // A full sync chained after every currently-queued resolution — debounced so a
  // burst of clicks collapses into exactly one trailing sync, and appended onto
  // `resolveQueue` (not called directly) so it only actually runs once every
  // in-flight "keep local"/"keep remote" call has finished writing sync state.
  const scheduleFollowUpSync = useCallback(() => {
    if (followUpTimer.current) clearTimeout(followUpTimer.current);
    followUpTimer.current = setTimeout(() => {
      followUpTimer.current = null;
      resolveQueue.current = resolveQueue.current.then(() => syncNow());
    }, 600);
  }, [syncNow]);

  // Resolve ONE both-changed conflict — "local" keeps this device's copy, "remote"
  // discards this device's edits and takes the other copy. Deliberately NOT routed
  // through `runSync`/`busy`: each call is a single lightweight engine op (one note
  // download, not a full two-way sync), so resolving several conflicts in a row
  // never blocks on each other or freezes the rest of the panel. Concurrent calls
  // are still serialized onto `resolveQueue` so their state-file read-modify-writes
  // can't race; a trailing sync is scheduled only on success, after the engine's own
  // bookkeeping already reflects the choice.
  const resolveConflict = useCallback(
    (noteId: string, keep: "local" | "remote") => {
      if (!isTauri() || resolvingRef.current.has(noteId)) return;
      resolvingRef.current.add(noteId);
      setResolvingIds(new Set(resolvingRef.current));
      setConflictErrors((errs) => {
        if (!(noteId in errs)) return errs;
        const next = { ...errs };
        delete next[noteId];
        return next;
      });
      const run = async () => {
        try {
          const engine = createEngine();
          if (keep === "local") await engine.keepLocal(noteId);
          else await engine.keepRemote(noteId);
          setUi((u) => {
            const conflicts = u.conflicts.filter((c) => c.noteId !== noteId);
            return { ...u, conflicts, phase: conflicts.length > 0 ? "conflicts" : u.phase === "conflicts" ? "idle" : u.phase };
          });
          if (keep === "remote") onChangedRef.current?.(); // local content just changed on disk
          scheduleFollowUpSync();
        } catch (e) {
          log.error("sync", "resolveConflict.failed", { noteId, keep, error: String(e) });
          setConflictErrors((errs) => ({ ...errs, [noteId]: "Couldn't apply — try again." }));
        } finally {
          resolvingRef.current.delete(noteId);
          setResolvingIds(new Set(resolvingRef.current));
        }
      };
      resolveQueue.current = resolveQueue.current.then(run);
    },
    [scheduleFollowUpSync],
  );

  const keepLocal = useCallback((noteId: string) => resolveConflict(noteId, "local"), [resolveConflict]);
  const keepRemote = useCallback((noteId: string) => resolveConflict(noteId, "remote"), [resolveConflict]);

  // The common single-user case after being offline a while: trust this device for
  // everything pending rather than clicking each one — still just N queued single-note
  // resolves + one trailing sync, not a special bulk code path.
  const keepAllLocal = useCallback(() => {
    for (const c of ui.conflicts) resolveConflict(c.noteId, "local");
  }, [ui.conflicts, resolveConflict]);

  return {
    ui,
    connect,
    disconnect,
    syncNow,
    summon,
    keepLocal,
    keepRemote,
    keepAllLocal,
    resolvingIds,
    conflictErrors,
    refreshInfo,
    restoreFromCloud,
  };
}
