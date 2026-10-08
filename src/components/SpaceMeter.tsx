// A whisper-thin storage meter for the sync panel: how much OneDrive room is left.
// Ambient, not alarming — a 2px track in muted ink that only turns `warn` when the
// drive is nearly full (the one time the number actually demands a decision). The
// fill is muted, NOT accent: accent is reserved for the live/active moments
// (design.md — one accent colour, used sparingly).

import { formatBytes } from "../lib/format";
import type { SyncQuota } from "../lib/sync/types";

export function SpaceMeter({ quota }: { quota: SyncQuota }) {
  const { usedBytes, totalBytes } = quota;
  if (!totalBytes) return null;
  const usedFrac = Math.max(0, Math.min(1, usedBytes / totalBytes));
  const tight = usedFrac >= 0.9; // nearly full — now the number matters
  const free = Math.max(0, totalBytes - usedBytes);

  return (
    <div>
      <div className="h-0.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full ${tight ? "bg-warn" : "bg-text-muted"}`}
          style={{ width: `${usedFrac * 100}%` }}
        />
      </div>
      <p className={`mt-1.5 text-xs ${tight ? "text-warn" : "text-text-muted"}`}>
        {formatBytes(free)} free of {formatBytes(totalBytes)}
      </p>
    </div>
  );
}
