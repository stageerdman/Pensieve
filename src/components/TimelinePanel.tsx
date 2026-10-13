import { useEffect, useRef, useState } from "react";
import type { TimelineEntry } from "../lib/types";
import { getStore } from "../lib/store";
import { groupByDay } from "../lib/timeline";
import { RightPanel } from "./RightPanel";
import { NotePreview } from "../features/gallery/NotePreview";
import { ChevronDown } from "./icons";

// "What was added when" — now also the note's VERSION HISTORY. Each moment carries a
// body snapshot (see timeline.ts / useNotes). Click a moment to expand a read-only
// preview of the note as it was then; older versions offer a destructive Restore that
// reverts the body and deletes every newer version (2-step confirm). The newest moment
// is the live "Current" content and isn't restorable (it would delete nothing). Lives in
// the shared right dock; Esc closes it (handled by parent).

interface TimelinePanelProps {
  noteId: string;
  noteTitle: string;
  theme: "light" | "dark";
  reloadKey: number; // bumped by the parent after a restore so entries re-load
  onRestore: (ts: number) => void;
  onClose: () => void;
}

const CONFIRM_MS = 3000; // the armed "confirm restore" window before it self-cancels

function delta(e: TimelineEntry): string {
  if (e.wordDelta > 0) return `+${e.wordDelta} words`;
  if (e.wordDelta < 0) return `${e.wordDelta} words`;
  return "created";
}

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TimelinePanel({
  noteId,
  noteTitle,
  theme,
  reloadKey,
  onRestore,
  onClose,
}: TimelinePanelProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [openTs, setOpenTs] = useState<number | null>(null); // single-open accordion
  const [armedTs, setArmedTs] = useState<number | null>(null); // restore awaiting confirm
  const armTimer = useRef<ReturnType<typeof setTimeout>>();

  // (Re)load on note switch AND after a restore (reloadKey bump) so the list reflects the
  // truncated history. Collapse + disarm on any reload.
  useEffect(() => {
    getStore().loadTimeline(noteId).then(setEntries);
    setOpenTs(null);
    setArmedTs(null);
  }, [noteId, reloadKey]);

  useEffect(() => {
    return () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, []);

  // The newest entry overall is the live content — restoring it is a no-op, so it's shown
  // as "Current" and offers no Restore.
  const newestTs = entries.reduce((m, e) => Math.max(m, e.ts), -Infinity);
  const groups = groupByDay(entries, Date.now());

  const toggle = (ts: number) => {
    setArmedTs(null);
    setOpenTs((cur) => (cur === ts ? null : ts));
  };

  // First click arms (3s window); a second click within it commits. Arming elsewhere or
  // reopening a row cancels. The armed label names exactly how many versions will be lost.
  const clickRestore = (ts: number) => {
    if (armTimer.current) clearTimeout(armTimer.current);
    if (armedTs === ts) {
      setArmedTs(null);
      onRestore(ts);
      return;
    }
    setArmedTs(ts);
    armTimer.current = setTimeout(() => setArmedTs(null), CONFIRM_MS);
  };

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
            const isCurrent = e.ts === newestTs;
            const open = openTs === e.ts;
            const armed = armedTs === e.ts;
            const newerCount = entries.filter((x) => x.ts > e.ts).length;
            return (
              <div key={e.ts} className="mb-1">
                <button
                  type="button"
                  onClick={() => restorable && toggle(e.ts)}
                  disabled={!restorable}
                  className={
                    "flex w-full items-baseline gap-2 rounded py-1 text-left text-sm" +
                    (open ? " bg-surface-raised px-1" : "") +
                    (restorable ? "" : " cursor-default")
                  }
                >
                  <span className="text-accent">●</span>
                  <span className="text-text-muted">{time(e.ts)}</span>
                  <span className="text-text">{delta(e)}</span>
                  {e.created && <span className="text-2xs text-text-muted/70">created</span>}
                  {isCurrent && <span className="text-2xs text-text-muted/70">Current</span>}
                  {restorable && (
                    <ChevronDown
                      size={14}
                      className={
                        "ml-auto shrink-0 self-center text-text-muted transition-transform" +
                        (open ? "" : " -rotate-90")
                      }
                    />
                  )}
                </button>

                {open && restorable && (
                  <div className="mb-2 ml-4 mt-1 border-l border-border pl-3">
                    <div className="max-h-64 overflow-y-auto rounded bg-surface-sunken p-2">
                      <NotePreview markdown={e.markdown!} theme={theme} />
                    </div>
                    {!isCurrent && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => clickRestore(e.ts)}
                          className={
                            armed
                              ? "rounded bg-danger/10 px-2 py-1 text-sm text-danger"
                              : "text-sm text-text-muted hover:text-text"
                          }
                        >
                          {armed
                            ? `Restore — deletes ${newerCount} newer`
                            : "Restore this version"}
                        </button>
                        {!armed && (
                          <div className="mt-0.5 text-2xs text-text-muted/70">
                            Newer versions will be deleted
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </RightPanel>
  );
}
