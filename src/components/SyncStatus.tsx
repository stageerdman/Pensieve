import { useEffect, useRef, useState } from "react";
import { SyncRune } from "./icons";
import { SyncFlask } from "./SyncFlask";
import { SpaceMeter } from "./SpaceMeter";
import { relativeTime, formatBytes } from "../lib/format";
import type { useSync } from "../hooks/useSync";

// The one OneDrive sync affordance: a quiet cloud-sync rune in the header, nearly
// invisible at rest, that UNFOLDS into a small non-modal details panel on click.
// A whisper, not a shout (design.md) — sync is ambient, never a dashboard. Motion
// means a transfer is happening and nothing else; the panel tells the truth about
// account, space, what's moving, and why anything failed.

type Sync = ReturnType<typeof useSync>;

// Only tag a current transfer with its byte size when it's big enough to matter
// (a media file dominating the batch) — small .md notes don't need a byte tail.
const BIG_FILE = 512 * 1024;

export function SyncStatus({
  sync,
  titleFor,
  pending = false,
}: {
  sync: Sync;
  titleFor: (noteId: string) => string;
  pending?: boolean; // unsynced local changes — shows the quiet "ready to back up" nudge
}) {
  const { ui, connect, disconnect, syncNow, summon, keepLocal, refreshInfo } = sync;
  const [open, setOpen] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Brief success flash right after a sync, then settle back to calm muted.
  useEffect(() => {
    if (ui.phase !== "synced") return;
    setJustSynced(true);
    const t = setTimeout(() => setJustSynced(false), 1500);
    return () => clearTimeout(t);
  }, [ui.phase, ui.lastSyncedAt]);

  // Freshen account + quota when the panel is opened (they drift between syncs).
  useEffect(() => {
    if (open) void refreshInfo();
  }, [open, refreshInfo]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (ui.phase === "unavailable") return null;

  const syncing = ui.phase === "syncing";
  const disconnected = ui.phase === "disconnected";
  const errored = ui.phase === "error";
  const needsSummon = ui.phase === "needs-summon"; // connected, but not set up on this drive
  const connected = !disconnected; // signed in (even while a transfer errors / awaits summon)
  // The quiet nudge only shows at rest and never right after a sync.
  const nudge = pending && !justSynced && (ui.phase === "idle" || ui.phase === "synced");

  const transfer = syncing ? ui.transfer : null;
  const level = transfer && transfer.totalItems > 0 ? transfer.doneItems / transfer.totalItems : 0;

  // An attention dot for anything that needs the owner to act.
  const dot = ui.phase === "conflicts" || needsSummon ? "bg-warn" : null;
  // Glyph colour + flow are CSS, keyed by data-state (see .sync-icon in index.css).
  // ONLY "syncing" flows; everything else is still (colour alone carries meaning).
  const glyphState = disconnected || errored || needsSummon
    ? "offline"
    : syncing
      ? "syncing"
      : justSynced
        ? "flash"
        : nudge
          ? "reminder"
          : "rest";

  const headerTitle = (): string => {
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
  };

  const subText = (): string | null => {
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
  };

  const primary = (): { label: string; hint?: string; onClick: () => void } | null => {
    if (disconnected) return { label: "Connect OneDrive", onClick: () => void connect() };
    if (needsSummon) return { label: "Summon Pensieve", onClick: () => void summon() };
    if (errored) {
      // Expired genuinely needs a fresh sign-in; a transient/other error just needs
      // another attempt — don't push people through OAuth for a network blip.
      return ui.errorKind === "expired"
        ? { label: "Reconnect", onClick: () => void connect() }
        : { label: "Try again", onClick: () => void syncNow() };
    }
    if (syncing) return null; // nothing to do while it's working
    return { label: "Back up now", hint: "⌘S", onClick: () => void syncNow() };
  };
  const p = primary();

  const showMeter = connected && !errored && !needsSummon && !!ui.quota;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="OneDrive sync"
        title={headerTitle()}
        onClick={() => setOpen((v) => !v)}
        data-state={glyphState}
        className={
          "sync-icon relative inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors " +
          (open ? "bg-surface-raised" : "hover:bg-surface-raised")
        }
      >
        <SyncRune />
        {dot && <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sync status"
          className="sync-panel absolute right-0 top-9 z-20 w-[280px] rounded-lg border border-border bg-surface-raised p-3 shadow-lg"
        >
          {/* Header: the same rune, breathing once as the panel opens, + the verb */}
          <div className="flex items-start gap-2">
            <span
              className="sync-icon sync-panel-glyph mt-px shrink-0 text-text-muted"
              data-state={glyphState}
              aria-hidden
            >
              <SyncRune size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">{headerTitle()}</p>
              {subText() && <p className="mt-0.5 text-xs leading-snug text-text-muted">{subText()}</p>}
            </div>
          </div>

          {/* Live transfer — present ONLY while syncing. Its absence at rest is why
              the idle panel feels calm and short. */}
          {syncing && (
            <div className="mt-3 flex items-center gap-2.5">
              <SyncFlask level={level} active className="h-6 w-5 shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                {transfer ? (
                  <>
                    <p className="text-xs text-text">
                      <span className="text-text-muted">{transfer.direction === "down" ? "↓" : "↑"}</span>{" "}
                      {transfer.doneItems + 1} of {transfer.totalItems}
                      {transfer.bytes && transfer.bytes > BIG_FILE && (
                        <span className="text-text-muted"> · {formatBytes(transfer.bytes)}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-text-muted" title={titleFor(transfer.name)}>
                      {titleFor(transfer.name)}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-text-muted">Looking for changes…</p>
                )}
              </div>
            </div>
          )}

          {/* Space — ambient reference, muted (accent is reserved for live moments) */}
          {showMeter && (
            <div className="mt-3">
              <SpaceMeter quota={ui.quota!} />
            </div>
          )}

          {/* Conflicts */}
          {ui.phase === "conflicts" && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {ui.conflicts.map((c) => (
                <div key={c.noteId} className="text-xs">
                  <p className="truncate font-medium text-text" title={titleFor(c.noteId)}>
                    {titleFor(c.noteId)}
                  </p>
                  <p className="text-text-muted">Changed here and elsewhere. Your copy is kept.</p>
                  <button
                    type="button"
                    onClick={() => void keepLocal(c.noteId)}
                    className="mt-1 text-accent hover:underline"
                  >
                    Keep this device&rsquo;s version
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Primary action */}
          {p && (
            <button
              type="button"
              onClick={() => {
                if (ui.phase !== "conflicts") setOpen(false);
                p.onClick();
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface"
            >
              {p.label}
              {p.hint && <span className="text-xs text-text-muted">{p.hint}</span>}
            </button>
          )}

          {/* Footer: which account this backs up to + a quiet way out */}
          {connected && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
              <span className="min-w-0 truncate text-xs text-text-muted" title={ui.account?.email}>
                {ui.account?.email ?? "OneDrive"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void disconnect();
                }}
                className="shrink-0 text-xs text-text-muted hover:text-text"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
