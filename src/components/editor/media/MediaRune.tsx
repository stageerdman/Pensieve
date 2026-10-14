import type { MediaBackupState } from "../../../lib/media";

// The gold backup "sync rune", drawn bottom-right of a media frame (wiki "States matrix —
// absence = healthy"):
//   • local      → a hollow gold dot: "held here, not safe in the cloud yet"
//   • uploading  → a filled gold dot that pulses: backing up right now
//   • backed-up  → NOTHING (the rune renders null) — absence is the restful default
//   • failed     → a warn-tinted dot: a backup attempt failed (auto-retried, never asks)
// Quiet and non-blocking: a tiny dot, pointer-events:none, no text unless hovered (title).
export function MediaRune({ state }: { state: MediaBackupState }) {
  if (state === "backed-up") return null; // absence = healthy
  const title =
    state === "uploading"
      ? "Backing up…"
      : state === "failed"
        ? "Backup failed — will retry"
        : "Held locally — not backed up yet";
  return <span className={"pensieve-media-rune is-" + state} aria-hidden title={title} />;
}
