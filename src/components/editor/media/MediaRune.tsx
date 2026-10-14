import type { MediaBackupState } from "../../../lib/media";
import { SyncRune } from "../../icons";

// The gold backup "sync rune", drawn bottom-right of a media frame (wiki "States matrix —
// absence = healthy"). It reuses the app's real sync glyph (the figure-8 lemniscate "S",
// icons.SyncRune) so backup reads the same everywhere — NOT a bespoke dot.
//   • local      → the gold rune at rest: "held here, not safe in the cloud yet"
//   • uploading  → the gold rune, gently pulsing: backing up right now
//   • backed-up  → NOTHING (renders null) — absence is the restful default
//   • failed     → a warn-tinted rune: a backup attempt failed (auto-retried, never asks)
// Quiet and non-blocking: small, pointer-events:none, the state as a hover title only.
export function MediaRune({ state }: { state: MediaBackupState }) {
  if (state === "backed-up") return null; // absence = healthy
  const title =
    state === "uploading"
      ? "Backing up…"
      : state === "failed"
        ? "Backup failed — will retry"
        : "Held locally — not backed up yet";
  return (
    <span className={"pensieve-media-rune is-" + state} aria-hidden title={title}>
      <SyncRune size={15} />
    </span>
  );
}
