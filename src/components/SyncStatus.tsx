import { useEffect, useMemo, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { SyncRune } from "./icons";
import { SyncFlask } from "./SyncFlask";
import { SpaceMeter } from "./SpaceMeter";
import { RestoreFromCloud } from "./RestoreFromCloud";
import { formatBytes } from "../lib/format";
import { deriveSyncView } from "../lib/sync/deriveSyncView";
import type { useSync } from "../hooks/useSync";
import { isTauri } from "../lib/store";
import { NativeTranscriptionEngine } from "../lib/transcripts/nativeEngine";
import { ProcessQueue, type ProcessQueueHandle } from "./transcription/ProcessQueue";

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
  const { ui, connect, disconnect, syncNow, summon, keepLocal, refreshInfo, restoreFromCloud } = sync;
  const [open, setOpen] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const ref = useDismiss<HTMLDivElement>(() => setOpen(false), { enabled: open });

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

  // The native transcription engine (desktop only) and a handle to the Process queue.
  const engine = useMemo(() => (isTauri() ? new NativeTranscriptionEngine() : null), []);
  const queueApi = useRef<ProcessQueueHandle>(null);

  // Opening the drawer rescans the vault so manually-added recordings appear.
  useEffect(() => {
    if (open) void queueApi.current?.refresh();
  }, [open]);

  // Owner rule: a completed sync pulls in any newly-synced, untranscribed audio and
  // auto-transcribes it (Czech default). Sync stays primary; transcription runs after/in
  // parallel. (A recording added locally in a note waits for manual Process or the next sync.)
  useEffect(() => {
    if (ui.phase === "synced") void queueApi.current?.enqueueAuto();
  }, [ui.phase, ui.lastSyncedAt]);

  const view = deriveSyncView(ui, pending, justSynced);
  if (view.hidden) return null;

  const { connected, syncing, dot, glyphState, headerTitle, subText, showMeter } = view;

  const transfer = syncing ? ui.transfer : null;
  const level = transfer && transfer.totalItems > 0 ? transfer.doneItems / transfer.totalItems : 0;

  // Map the pure primary-action descriptor to its handler (kept out of the pure layer).
  const p = view.primary;
  const runPrimary = () => {
    switch (p?.kind) {
      case "connect":
      case "reconnect":
        void connect();
        break;
      case "summon":
        void summon();
        break;
      case "retry":
      case "backup":
        void syncNow();
        break;
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="OneDrive sync"
        title={headerTitle}
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

      <div
        role="dialog"
        aria-label="Sync and transcription"
        aria-hidden={!open}
        className={
          "fixed bottom-0 right-0 top-0 z-40 flex w-[352px] flex-col border-l border-border bg-surface-raised shadow-lg transition-transform duration-300 " +
          (open ? "translate-x-0" : "pointer-events-none translate-x-full")
        }
      >
        <div className="flex-none overflow-y-auto p-3">
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
              <p className="text-sm font-medium text-text">{headerTitle}</p>
              {subText && <p className="mt-0.5 text-xs leading-snug text-text-muted">{subText}</p>}
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
              onClick={() => runPrimary()}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface"
            >
              {p.label}
              {p.hint && <span className="text-xs text-text-muted">{p.hint}</span>}
            </button>
          )}

          {/* Restore everything from cloud — the quiet, destructive escape hatch.
              Only while connected and not mid-transfer (it drives the same runner). */}
          {connected && !syncing && (
            <div className="mt-3 border-t border-border pt-2.5">
              <RestoreFromCloud
                onConfirm={() => {
                  setOpen(false);
                  void restoreFromCloud();
                }}
              />
            </div>
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

        {/* The Process queue — untranscribed audio, below the sync info. Always mounted
            (even when the drawer is slid closed) so background transcription keeps running;
            it renders nothing when there is nothing to process. */}
        {engine && (
          <ProcessQueue
            ref={queueApi}
            engine={engine}
            titleFor={titleFor}
            enabled
            onTranscribed={() => void syncNow()}
          />
        )}
      </div>
    </div>
  );
}
