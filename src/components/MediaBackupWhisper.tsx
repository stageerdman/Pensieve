import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribeMediaBackupAll, mediaBackupSummary, isMediaBackupEnabled } from "../lib/media";
import { mediaToast } from "./editor/media/mediaToast";
import { onMediaTransferProgress } from "../lib/sync/native";

// The ONE aggregate surface for media backup (design.md "a whisper, not a shout"):
//   • a quiet "Backing up N file(s)…" line bottom-right while uploads are in flight, which
//     disappears on its own once everything is safe (absence = healthy);
//   • exactly one toast when a new failure appears — backup auto-retries, so we never ask
//     the user to act, we just let them know once.
// Sits a little above StatusWhisper so the two never overlap.
//
// "file" not "image": the same media/ ref scheme carries audio and video recordings too
// (they're just as likely — more, really — to be the thing that's slow to back up).
export function MediaBackupWhisper() {
  const summary = useSyncExternalStore(subscribeMediaBackupAll, mediaBackupSummary);
  const lastFailed = useRef(0);
  // Real byte progress for an in-flight large (chunked) upload — small ones finish in
  // one shot and never emit this. Without it, a big file that's genuinely moving looks
  // identical to one that's stuck, which was the whole complaint this update started from.
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);

  useEffect(() => {
    if (!isMediaBackupEnabled()) return;
    // Only toast when the failure count GROWS (a new file failed), not on every render.
    if (summary.failed > lastFailed.current) {
      mediaToast("Couldn't back up a file — will retry.");
    }
    lastFailed.current = summary.failed;
  }, [summary.failed]);

  useEffect(() => onMediaTransferProgress("upload", (p) => setProgress({ sent: p.sent, total: p.total })), []);
  useEffect(() => {
    if (summary.uploading === 0) setProgress(null);
  }, [summary.uploading]);

  if (!isMediaBackupEnabled() || summary.uploading === 0) return null;
  const n = summary.uploading;
  const pct = progress && progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : null;
  return (
    <div className="pointer-events-none fixed bottom-8 right-4 text-xs text-text-muted opacity-70 transition-opacity duration-700">
      Backing up {n} file{n === 1 ? "" : "s"}…{pct != null && pct < 100 ? ` ${pct}%` : ""}
    </div>
  );
}
