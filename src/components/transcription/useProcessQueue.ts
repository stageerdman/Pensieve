// The Process queue hook — the live state + engine driver behind the sync drawer's
// "Process" section. Implements the owner's interaction model (prototype-proven):
//   · Global Run/Pause + a mode (1 = top item only then pause · → = run the whole queue).
//   · Rows are ordered by an editable number; the lowest-ordered row is the active one.
//   · One job at a time; the engine reports progress; on finish we save the sidecar,
//     reindex, fire onTranscribed (→ sync), and drop the row.
//   · Changing a row's model resets its progress.
//   · Auto path: enqueueAuto() (called on sync) adds every untranscribed audio and plays
//     with the default (Czech) model.
// NOTE on the real engine: an MLX subprocess can't be suspended mid-file, so Pause stops
// STARTING new jobs — a job already running finishes. Reordering changes what runs next.

import { useCallback, useEffect, useRef, useState } from "react";
import { getStore } from "../../lib/store";
import { reindex } from "../../lib/search/reindexController";
import { listUntranscribedAudio } from "../../lib/transcripts/queue";
import { parseMediaPath } from "../../lib/media/ref";
import { DEFAULT_MODEL, type TranscriptionModel } from "../../lib/transcripts/models";
import type { TranscriptionEngine } from "../../lib/transcripts/engine";
import { log } from "../../lib/logger";
import { processQueue } from "./processQueueController";
import {
  type ProcessItem,
  type QueueMode,
  activeItem,
  clearErrorsForRetry,
  mergeNewItems,
  reorderItems,
  setItemModel,
  sortItems,
} from "./queueOps";

export type { ProcessItem, QueueMode } from "./queueOps";

export interface UseProcessQueue {
  items: ProcessItem[]; // sorted by order
  playing: boolean;
  mode: QueueMode;
  activeRef: string | null;
  count: number;
  togglePlay(): void;
  setMode(m: QueueMode): void;
  reorder(ref: string, pos: number): void;
  setModel(ref: string, model: TranscriptionModel): void;
  refresh(): Promise<void>;
  enqueueAuto(): Promise<void>;
}

export function useProcessQueue(opts: {
  engine: TranscriptionEngine;
  titleFor: (noteId: string) => string;
  /** fired after a transcript sidecar is saved — the drawer uses it to trigger a sync. */
  onTranscribed?: () => void;
  enabled?: boolean; // desktop only
}): UseProcessQueue {
  const { engine, titleFor, onTranscribed, enabled = true } = opts;
  const [items, setItems] = useState<ProcessItem[]>([]);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<QueueMode>("all");

  const runningRef = useRef<string | null>(null);
  const modeRef = useRef<QueueMode>(mode);
  modeRef.current = mode;

  const sorted = sortItems(items);
  const active = activeItem(items);

  // ── the one-at-a-time engine driver ──────────────────────────────────────
  useEffect(() => {
    if (!enabled || !playing || runningRef.current) return;
    const next = activeItem(items);
    if (!next) {
      if (items.length === 0) setPlaying(false); // nothing left → stop
      return;
    }
    runningRef.current = next.ref;
    const { ref, noteId, model } = next;
    log.info("transcribe", "queue.start", { ref, model });
    engine
      .transcribe(ref, { model }, (p) => {
        setItems((prev) =>
          prev.map((i) => (i.ref === ref ? { ...i, pct: Math.round((p.pct ?? 0) * 100), phase: p.phase } : i)),
        );
      })
      .then(async (t) => {
        await getStore().saveTranscript(ref, t);
        reindex.request(noteId);
        onTranscribed?.();
        processQueue.notifyResult(ref, true); // let the originating block refresh
        runningRef.current = null;
        log.info("transcribe", "queue.done", { ref, segments: t.segments.length });
        setItems((prev) => prev.filter((i) => i.ref !== ref));
        if (modeRef.current === "one") setPlaying(false);
      })
      .catch((e) => {
        runningRef.current = null;
        log.error("transcribe", "queue.error", { ref, error: String(e) });
        processQueue.notifyResult(ref, false);
        setItems((prev) => prev.map((i) => (i.ref === ref ? { ...i, error: true, phase: null } : i)));
        setPlaying(false);
      });
  }, [items, playing, enabled, engine, onTranscribed]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      const next = !p;
      if (next) setItems((prev) => clearErrorsForRetry(prev)); // Run retries failed rows
      return next;
    });
  }, []);

  const reorder = useCallback((ref: string, pos: number) => {
    setItems((prev) => reorderItems(prev, ref, pos));
  }, []);

  const setModelFor = useCallback((ref: string, model: TranscriptionModel) => {
    setItems((prev) => setItemModel(prev, ref, model));
  }, []);

  // ── scan the vault for untranscribed audio, merging into the list ─────────
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const found = await listUntranscribedAudio(titleFor);
    setItems((prev) => mergeNewItems(prev, found, DEFAULT_MODEL));
  }, [enabled, titleFor]);

  // Force one ref into the queue and run it (a manual block "Transcribe" / "Regenerate" —
  // even if it already has a transcript, which the untranscribed scan would skip).
  const enqueueOne = useCallback(
    (req: { ref: string; noteId: string; model: TranscriptionModel }) => {
      const parsed = parseMediaPath(req.ref);
      const audioName = parsed ? `${parsed.mediaId}.${parsed.ext}` : req.ref;
      setItems((prev) => {
        const existing = prev.find((i) => i.ref === req.ref);
        if (existing) {
          // already listed → set its model, clear state, let it run
          return prev.map((i) => (i.ref === req.ref ? { ...i, model: req.model, pct: 0, error: false } : i));
        }
        const item: ProcessItem = {
          ref: req.ref,
          noteId: req.noteId,
          title: titleFor(req.noteId),
          audioName,
          type: "audio",
          order: prev.length + 1,
          model: req.model,
          pct: 0,
          phase: null,
          error: false,
        };
        return [...prev, item];
      });
      setPlaying(true);
    },
    [titleFor],
  );

  // Blocks (outside React) request transcription through the controller seam → it appears
  // in THIS queue with live progress, run by the single engine driver above.
  useEffect(() => {
    if (!enabled) return;
    return processQueue.subscribeRequests(enqueueOne);
  }, [enabled, enqueueOne]);

  const enqueueAuto = useCallback(async () => {
    await refresh();
    setPlaying(true); // auto path: Czech default (the item default), start running
  }, [refresh]);

  return {
    items: sorted,
    playing,
    mode,
    activeRef: active?.ref ?? null,
    count: items.length,
    togglePlay,
    setMode,
    reorder,
    setModel: setModelFor,
    refresh,
    enqueueAuto,
  };
}
