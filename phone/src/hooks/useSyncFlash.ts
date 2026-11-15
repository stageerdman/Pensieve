// useSyncFlash — what the sync rune SHOWS: the sync status, plus a brief green "flash"
// right after a sync finishes (syncing → synced), then calm again. Mirrors the desktop's
// SyncStatus flash so both devices confirm a finished sync the same way. UI-only: the
// sync machine's status is untouched (logic keeps comparing against "synced").

import { useEffect, useRef, useState } from "react";
import type { SyncStatus } from "../lib/wand/syncMachine";

export type SyncRuneState = SyncStatus | "flash";

export const SYNC_FLASH_MS = 1200;

export function useSyncFlash(status: SyncStatus, ms = SYNC_FLASH_MS): SyncRuneState {
  const prev = useRef(status);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const was = prev.current;
    prev.current = status;
    if (was === "syncing" && status === "synced") {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), ms);
      return () => clearTimeout(t);
    }
    setFlash(false);
  }, [status, ms]);
  return flash && status === "synced" ? "flash" : status;
}
