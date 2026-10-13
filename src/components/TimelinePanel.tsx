import { useEffect, useState } from "react";
import type { TimelineEntry } from "../lib/types";
import { getStore } from "../lib/store";
import { groupByDay } from "../lib/timeline";
import { RightPanel } from "./RightPanel";
import { RestoreControl } from "./RestoreControl";

// "What was added when" — and the note's VERSION HISTORY. Clicking a moment doesn't
// preview here; it loads that version into the MAIN page (read-only "time travel",
// nothing saved) — the parent owns that. This panel only lists the moments and marks,
// with a leading ›, the one currently shown. On that highlighted record — unless it's
// the newest (live) one — a Restore control offers a hold-to-confirm destructive revert
// that drops every newer version. Lives in the right dock; Esc closes it (parent).

interface TimelinePanelProps {
  noteId: string;
  noteTitle: string;
  reloadKey: number; // bumped by the parent after a restore so entries re-load
  previewTs: number | null; // which record the main page is showing (null = live/newest)
  onPreview: (entry: TimelineEntry | null) => void; // click a moment to view it
  onRestore: (ts: number) => void; // commit a restore (after the hold)
  onClose: () => void;
}

function delta(e: TimelineEntry): string {
  if (e.wordDelta > 0) return `+${e.wordDelta} words`;
  if (e.wordDelta < 0) return `${e.wordDelta} words`;
  return "created";
}

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function TimelinePanel({
  noteId,
  noteTitle,
  reloadKey,
  previewTs,
  onPreview,
  onRestore,
  onClose,
}: TimelinePanelProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);

  useEffect(() => {
    getStore().loadTimeline(noteId).then(setEntries);
  }, [noteId, reloadKey]);

  const newestTs = entries.reduce((m, e) => Math.max(m, e.ts), -Infinity);
  // What the main page shows: a chosen past version, or (null) the live note = newest.
  const highlightedTs = previewTs ?? newestTs;
  const groups = groupByDay(entries, Date.now());

  return (
    <RightPanel title={`Timeline · ${noteTitle || "Untitled"}`} onClose={onClose}>
      {entries.length === 0 && (
        <p className="text-sm text-text-muted">
          Nothing recorded yet. Your additions will appear here.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.label} className="mb-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted/70">
            {g.label}
          </div>
          {g.entries.map((e) => {
            const restorable = e.markdown !== undefined; // "" is a valid snapshot
            const isNewest = e.ts === newestTs;
            const highlighted = restorable && e.ts === highlightedTs;
            return (
              <div
                key={e.ts}
                className={
                  "flex items-center gap-1 rounded" +
                  (highlighted ? " bg-surface-raised px-1" : "")
                }
              >
                <button
                  type="button"
                  disabled={!restorable}
                  onClick={() => onPreview(isNewest ? null : e)}
                  className={
                    "flex flex-1 items-baseline gap-2 py-1 text-left text-sm" +
                    (restorable ? "" : " cursor-default")
                  }
                >
                  <span
                    className={"w-2 shrink-0 text-accent" + (highlighted ? "" : " opacity-0")}
                    aria-hidden
                  >
                    ›
                  </span>
                  <span className="text-accent">●</span>
                  <span className="text-text-muted">{time(e.ts)}</span>
                  <span className="text-text">{delta(e)}</span>
                  {e.created && <span className="text-2xs text-text-muted/70">created</span>}
                </button>
                {highlighted && !isNewest && (
                  <RestoreControl onConfirm={() => onRestore(e.ts)} />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </RightPanel>
  );
}
