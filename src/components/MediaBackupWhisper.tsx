import { useEffect, useRef, useSyncExternalStore } from "react";
import { subscribeMediaBackupAll, mediaBackupSummary, isMediaBackupEnabled } from "../lib/media";
import { mediaToast } from "./editor/media/mediaToast";

// The ONE aggregate surface for media backup (design.md "a whisper, not a shout"):
//   • a quiet "Backing up N image(s)…" line bottom-right while uploads are in flight, which
//     disappears on its own once everything is safe (absence = healthy);
//   • exactly one toast when a new failure appears — backup auto-retries, so we never ask
//     the user to act, we just let them know once.
// Sits a little above StatusWhisper so the two never overlap.
export function MediaBackupWhisper() {
  const summary = useSyncExternalStore(subscribeMediaBackupAll, mediaBackupSummary);
  const lastFailed = useRef(0);

  useEffect(() => {
    if (!isMediaBackupEnabled()) return;
    // Only toast when the failure count GROWS (a new image failed), not on every render.
    if (summary.failed > lastFailed.current) {
      mediaToast("Couldn't back up an image — will retry.");
    }
    lastFailed.current = summary.failed;
  }, [summary.failed]);

  if (!isMediaBackupEnabled() || summary.uploading === 0) return null;
  const n = summary.uploading;
  return (
    <div className="pointer-events-none fixed bottom-8 right-4 text-xs text-text-muted opacity-70 transition-opacity duration-700">
      Backing up {n} image{n === 1 ? "" : "s"}…
    </div>
  );
}
