import { useSyncExternalStore } from "react";
import {
  subscribeMediaBackup,
  subscribeMediaBackupAll,
  getMediaBackupState,
  isMediaBackupEnabled,
  type MediaBackupState,
} from "../../../lib/media";

// Subscribe a component to one media ref's backup state (for the gold rune). When backup
// isn't connected we report "backed-up" so no rune shows — an image on a drive-less setup
// shouldn't wear a permanent "not safe yet" dot. A null/external ref is also "backed-up".
export function useMediaBackup(ref: string | null | undefined): MediaBackupState {
  return useSyncExternalStore(
    (cb) => {
      const unsubs = [subscribeMediaBackupAll(cb)];
      if (ref) unsubs.push(subscribeMediaBackup(ref, cb));
      return () => unsubs.forEach((u) => u());
    },
    () => (isMediaBackupEnabled() ? getMediaBackupState(ref) : "backed-up"),
  );
}
