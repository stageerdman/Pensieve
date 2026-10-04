import { useEffect, useState } from "react";
import type { TimelineEntry } from "../lib/types";
import { getStore } from "../lib/store";
import { groupByDay } from "../lib/timeline";
import { RightPanel } from "./RightPanel";

// "What was added when", newest first, grouped by day. Read-only in v1 (no
// restore/diff). Lives in the shared right dock; Esc closes it (handled by parent).

interface TimelinePanelProps {
  noteId: string;
  noteTitle: string;
  onClose: () => void;
}

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

export function TimelinePanel({ noteId, noteTitle, onClose }: TimelinePanelProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);

  useEffect(() => {
    getStore().loadTimeline(noteId).then(setEntries);
  }, [noteId]);

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
          {g.entries.map((e, i) => (
            <div key={i} className="flex items-baseline gap-2 py-1 text-sm">
              <span className="text-accent">●</span>
              <span className="text-text-muted">{time(e.ts)}</span>
              <span className="text-text">{delta(e)}</span>
              {e.created && (
                <span className="text-xs text-text-muted/70">created</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </RightPanel>
  );
}
