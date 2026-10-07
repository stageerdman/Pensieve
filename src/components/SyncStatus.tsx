import { useEffect, useRef, useState } from "react";
import { SyncRune } from "./icons";
import { relativeTime } from "../lib/format";
import type { useSync } from "../hooks/useSync";

// The one OneDrive sync affordance: a quiet cloud-sync IconButton in the header,
// nearly invisible at rest, with a small non-modal popover on click. A whisper,
// not a shout (design.md) — sync is ambient, never a dashboard. The warn/danger
// dot is the only colour the glyph shows; no permanent "all good" green.

type Sync = ReturnType<typeof useSync>;

export function SyncStatus({
  sync,
  titleFor,
  pending = false,
}: {
  sync: Sync;
  titleFor: (noteId: string) => string;
  pending?: boolean; // unsynced local changes — shows the golden "suggest sync" nudge
}) {
  const { ui, connect, disconnect, syncNow, keepLocal } = sync;
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
  const connected = !disconnected;
  // The golden nudge only shows at rest (active sync / conflicts / errors own the
  // glyph first) and never when just-synced (nothing is pending right after a sync).
  const nudge = pending && !justSynced && (ui.phase === "idle" || ui.phase === "synced");

  const dot =
    ui.phase === "conflicts" ? "bg-warn" : ui.phase === "error" ? "bg-danger" : null;
  // The glyph's colour + flow are CSS, keyed by this state (see .sync-icon in
  // index.css). conflicts/error keep a static S and show their dot instead.
  const glyphState = disconnected
    ? "disconnected"
    : syncing
      ? "syncing"
      : justSynced
        ? "flash"
        : nudge
          ? "reminder"
          : "rest";

  const statusLine = (): string => {
    switch (ui.phase) {
      case "disconnected":
        return "Not backing up.";
      case "syncing":
        return "Syncing…";
      case "error":
        return "Sign-in expired.";
      case "conflicts":
        return `${ui.conflicts.length} ${ui.conflicts.length === 1 ? "note" : "notes"} changed here and elsewhere.`;
      case "synced":
      case "idle":
      default:
        if (nudge) return "Unsynced changes.";
        return ui.lastSyncedAt ? `Synced ${relativeTime(ui.lastSyncedAt)}.` : "Backed up.";
    }
  };

  const primary = (): { label: string; onClick: () => void; disabled?: boolean } => {
    if (disconnected) return { label: "Connect OneDrive", onClick: () => void connect() };
    if (ui.phase === "error") return { label: "Reconnect", onClick: () => void connect() };
    if (syncing) return { label: "Syncing…", onClick: () => {}, disabled: true };
    return { label: "Sync now", onClick: () => void syncNow() };
  };
  const p = primary();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="OneDrive sync"
        title={statusLine()}
        onClick={() => setOpen((v) => !v)}
        data-state={glyphState}
        className={
          "sync-icon relative inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors " +
          (open ? "bg-surface-raised" : "hover:bg-surface-raised")
        }
      >
        <SyncRune />
        {dot && (
          <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sync status"
          className="absolute right-0 top-9 z-20 w-[260px] rounded-lg border border-border bg-surface-raised p-3 shadow-lg"
        >
          <p className="text-sm font-medium text-text">{statusLine()}</p>

          {ui.error && (
            <p className="mt-1 text-xs leading-snug text-text-muted">
              {ui.phase === "error" ? "Reconnect to keep backing up." : ui.error}
            </p>
          )}

          <button
            type="button"
            disabled={p.disabled}
            onClick={() => {
              if (!p.disabled) {
                if (ui.phase !== "conflicts") setOpen(false);
                p.onClick();
              }
            }}
            className={
              "mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm transition-colors " +
              (p.disabled ? "text-text-muted" : "text-text hover:bg-surface")
            }
          >
            {p.label}
            {p.label === "Sync now" && <span className="text-xs text-text-muted">⌘S</span>}
          </button>

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

          {connected && (ui.phase === "idle" || ui.phase === "synced") && (
            <p className="mt-3 text-xs leading-snug text-text-muted">
              Sync before and after editing to keep one clean copy.
            </p>
          )}

          {connected && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void disconnect();
              }}
              className="mt-3 block text-xs text-text-muted hover:text-text"
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
