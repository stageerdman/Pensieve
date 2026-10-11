import type { SyncUi } from "./types";
import { relativeTime } from "../format";

// Pure derivation of everything the sync header affordance shows — glyph state, copy,
// the attention dot, which primary action to offer — from the sync UI state. Kept DOM-
// free and framework-free so it's unit-testable and reusable (e.g. a future menu-bar
// item). The component maps `primary.kind` to the actual handler; this stays pure.

export type GlyphState = "offline" | "syncing" | "flash" | "reminder" | "rest";
export type PrimaryActionKind = "connect" | "summon" | "reconnect" | "retry" | "backup";

export interface SyncView {
  /** phase === "unavailable" (sync is desktop-only) → render nothing. */
  hidden: boolean;
  connected: boolean;
  syncing: boolean;
  /** A quiet "ready to back up" nudge (unsynced changes, at rest). */
  nudge: boolean;
  /** Attention dot class, or null. */
  dot: "bg-warn" | null;
  glyphState: GlyphState;
  headerTitle: string;
  subText: string | null;
  primary: { kind: PrimaryActionKind; label: string; hint?: string } | null;
  showMeter: boolean;
}

export function deriveSyncView(ui: SyncUi, pending: boolean, justSynced: boolean): SyncView {
  const syncing = ui.phase === "syncing";
  const disconnected = ui.phase === "disconnected";
  const errored = ui.phase === "error";
  const needsSummon = ui.phase === "needs-summon"; // connected, but not set up on this drive
  const connected = !disconnected; // signed in (even while a transfer errors / awaits summon)
  // The quiet nudge only shows at rest and never right after a sync.
  const nudge = pending && !justSynced && (ui.phase === "idle" || ui.phase === "synced");
  const transfer = syncing ? ui.transfer : null;

  // An attention dot for anything that needs the owner to act.
  const dot: "bg-warn" | null = ui.phase === "conflicts" || needsSummon ? "bg-warn" : null;

  // Glyph colour + flow are CSS, keyed by data-state. ONLY "syncing" flows; everything
  // else is still (colour alone carries meaning).
  const glyphState: GlyphState =
    disconnected || errored || needsSummon
      ? "offline"
      : syncing
        ? "syncing"
        : justSynced
          ? "flash"
          : nudge
            ? "reminder"
            : "rest";

  const headerTitle = ((): string => {
    switch (ui.phase) {
      case "disconnected":
        return "Back up your thoughts.";
      case "needs-summon":
        return "Pensieve isn't here yet.";
      case "syncing":
        return transfer?.direction === "down" ? "Catching up…" : "Backing up…";
      case "error":
        return ui.errorKind === "expired"
          ? "Sign-in expired."
          : ui.errorKind === "offline"
            ? "Can't reach OneDrive."
            : "Backup hit a snag.";
      case "conflicts":
        return `${ui.conflicts.length} ${ui.conflicts.length === 1 ? "note" : "notes"} changed here and elsewhere.`;
      case "synced":
      case "idle":
      default:
        return nudge ? "Ready to back up." : "All backed up.";
    }
  })();

  const subText = ((): string | null => {
    if (disconnected) {
      return ui.error ?? "Keep a copy of every note and recording in your OneDrive — it syncs quietly in the background.";
    }
    if (needsSummon) {
      return "This OneDrive has no Pensieve folder yet. Summon Pensieve to create it and back up your notes here. Nothing syncs until you do.";
    }
    if (errored) {
      if (ui.errorKind === "expired") return "Your notes are safe on this Mac — reconnect to keep backing up.";
      if (ui.errorKind === "offline") return "Your notes are safe on this Mac. We'll back up once OneDrive is reachable.";
      return ui.error;
    }
    if (syncing) return null; // the transfer row carries the detail
    if (ui.phase === "conflicts") return null; // conflict rows carry the detail
    return ui.lastSyncedAt ? `Last backed up · ${relativeTime(ui.lastSyncedAt)}` : "Not backed up yet.";
  })();

  const primary = ((): SyncView["primary"] => {
    if (disconnected) return { kind: "connect", label: "Connect OneDrive" };
    if (needsSummon) return { kind: "summon", label: "Summon Pensieve" };
    if (errored) {
      // Expired genuinely needs a fresh sign-in; a transient/other error just needs
      // another attempt — don't push people through OAuth for a network blip.
      return ui.errorKind === "expired"
        ? { kind: "reconnect", label: "Reconnect" }
        : { kind: "retry", label: "Try again" };
    }
    if (syncing) return null; // nothing to do while it's working
    return { kind: "backup", label: "Back up now", hint: "⌘S" };
  })();

  const showMeter = connected && !errored && !needsSummon && !!ui.quota;

  return {
    hidden: ui.phase === "unavailable",
    connected,
    syncing,
    nudge,
    dot,
    glyphState,
    headerTitle,
    subText,
    primary,
    showMeter,
  };
}
