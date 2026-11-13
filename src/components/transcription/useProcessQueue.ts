// The Process queue hook — the live state + engine driver behind the sync drawer's
// "Process" section. Implements the owner's interaction model (prototype-proven):
//   · Global Run/Pause + a mode (1 = top item only then pause · → = run the whole queue).
//   · Rows are ordered by an editable number; the lowest-ordered row is the active one.
//   · One job at a time; the engine reports progress; on finish we save the sidecar,
//     reindex, fire onTranscribed (→ sync), and drop the row.
//   · Changing a row's model resets its progress.
//   · Auto path: enqueueAuto() (called on sync) adds every untranscribed audio and plays
//     with the default model (English/Parakeet since 2026-11-13).
// NOTE on the real engine: an MLX subprocess can't be suspended mid-file, so Pause stops
// STARTING new jobs — a job already running finishes. Reordering changes what runs next.

import { useCallback, useEffect, useRef, useState } from "react";
import { getStore } from "../../lib/store";
import { reindex } from "../../lib/search/reindexController";
import { listUntranscribedAudio } from "../../lib/transcripts/queue";
import { listPackagesToResolve, listUnprocessedRawBatches } from "../../lib/raw/queue";
import { findPatronus, spellFor } from "../../lib/packages";
import { runPackage } from "../../lib/packages/run";
import { memoryFromPackage, modelForLanguage, packageRestorePoint, transcriptLanguage } from "../../lib/packages/resolve";
import { transcriptText } from "../../lib/formFill/fillForm";
import { parseForm } from "../../lib/forms";
import { processRawBatch } from "../../lib/raw/processRawBatch";
import { buildTauriRawBatchDeps } from "../../lib/raw/tauriRawBatchDeps";
import { listFormsToFill } from "../../lib/formFill/queue";
import { fillFormMemory } from "../../lib/formFill/fillForm";
import { askClaudeTauri } from "../../lib/formFill/askClaudeTauri";
import { parseMediaPath } from "../../lib/media/ref";
import { DEFAULT_MODEL, type TranscriptionModel } from "../../lib/transcripts/models";
import { isCancelled, type TranscriptionEngine } from "../../lib/transcripts/engine";
import { log } from "../../lib/logger";
import { processQueue } from "./processQueueController";
import { loadQueueState, saveQueueState, type PersistedRow } from "./queuePersistence";
import {
  type ProcessItem,
  type QueueMode,
  activeItem,
  clearErrorsForRetry,
  isAudioItem,
  isFormItem,
  isJournalItem,
  isPackageItem,
  mergeNewPackageItems,
  mergeNewFormItems,
  mergeNewItems,
  mergeNewJournalItems,
  reorderItems,
  setItemModel,
  sortItems,
} from "./queueOps";

export type { ProcessItem, QueueMode } from "./queueOps";

/** Turn a raw transcribe rejection into a short, human-readable reason for the error tooltip.
 *  The Rust error is `engine exited with <status>: <stderr tail>`; the tail interleaves JSON
 *  progress lines and tqdm bars with the real failure. Keep the last few meaningful lines
 *  (a Python traceback ends with the exception, e.g. `RuntimeError: Czech MLX model missing`). */
export function cleanEngineError(e: unknown): string {
  const raw = (typeof e === "string" ? e : (e as Error)?.message ?? String(e)).trim();
  if (!raw) return "Transcription failed (no error detail)";
  const meaningful = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("{") && !/\d+%\|/.test(l) && !/^\d+\/\d+\s*\[/.test(l));
  const tail = meaningful.slice(-4).join("\n");
  return (tail || raw).slice(0, 800);
}

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
  /** fired right after a journal batch's new Memories are written to disk — NOT gated on
   *  a sync pull (these notes are only ever created locally), so the feed/search list
   *  must refresh from this directly or the new Memories stay invisible until restart. */
  onNotesCreated?: (noteIds: string[]) => void;
  enabled?: boolean; // desktop only
}): UseProcessQueue {
  const { engine, titleFor, onTranscribed, onNotesCreated, enabled = true } = opts;
  const [items, setItems] = useState<ProcessItem[]>([]);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<QueueMode>("all");

  const runningRef = useRef<string | null>(null);
  const modeRef = useRef<QueueMode>(mode);
  modeRef.current = mode;

  const sorted = sortItems(items);
  const active = activeItem(items);

  // ── one journal batch: the Phase 5 AI split, via processRawBatch. One subprocess call
  // per page (not a streamed engine), so progress ticks once per page rather than
  // continuously — still a real, moving signal (pageDone/pageCount), not just "running".
  const runJournalItem = useCallback(
    async (ref: string) => {
      log.info("raw", "queue.start", { rawId: ref });
      const store = getStore();
      try {
        const rm = await store.loadRawMemory(ref);
        if (!rm) throw new Error("raw batch no longer exists");
        await store.saveRawMemory({ ...rm, status: "processing" });
        const result = await processRawBatch(rm, {
          ...buildTauriRawBatchDeps(store),
          onPageDone: (done, total) => {
            setItems((prev) => prev.map((i) => (i.ref === ref ? { ...i, pct: Math.round((done / total) * 100) } : i)));
          },
        });
        await store.removeRawMemory(ref);
        for (const noteId of result.createdNoteIds) reindex.request(noteId);
        onNotesCreated?.(result.createdNoteIds); // these notes are LOCAL-only — no sync pull will ever surface them
        onTranscribed?.(); // triggers a sync, same as a finished transcript would
        runningRef.current = null;
        log.info("raw", "queue.done", { rawId: ref, created: result.createdNoteIds.length });
        setItems((prev) => prev.filter((i) => i.ref !== ref));
        if (modeRef.current === "one") setPlaying(false);
      } catch (e) {
        runningRef.current = null;
        const msg = cleanEngineError(e);
        log.error("raw", "queue.error", { rawId: ref, error: msg });
        // Roll the batch back to "synced" so a retry (Run again) is possible — "processing"
        // must never be a stuck terminal state.
        const rm = await store.loadRawMemory(ref);
        if (rm) await store.saveRawMemory({ ...rm, status: "synced" });
        setItems((prev) => prev.map((i) => (i.ref === ref ? { ...i, error: true, errorMsg: msg, phase: null } : i)));
        setPlaying(false);
      }
    },
    [onTranscribed, onNotesCreated],
  );

  // ── one PACKAGE: Patronus reads its sync spell and decides; the app executes (see
  // lib/packages/run). Resolves into the memory with the SAME id (its media is already in
  // media/<id>/), first Timeline entry = what the phone sent (Redo's restore point), then the
  // record goes away (media kept) and a sync carries the memory + the tombstone to the phone.
  const runPackageItem = useCallback(
    async (ref: string) => {
      log.info("package", "queue.start", { id: ref });
      const store = getStore();
      const setStep = (step: string) => setItems((prev) => prev.map((i) => (i.ref === ref ? { ...i, step } : i)));
      try {
        const rm = await store.loadRawMemory(ref);
        if (!rm?.markdown) throw new Error("this package no longer exists");
        await store.saveRawMemory({ ...rm, status: "processing" });
        const template = rm.fromForm ? await store.load(rm.fromForm) : null;
        const res = await runPackage(
          {
            id: ref,
            kind: "form",
            title: rm.title || "Form",
            markdown: rm.markdown,
            fallbackInstruction: spellFor("form", template ? findPatronus(template.markdown)?.instruction : null),
            templateFields: template ? parseForm(template.markdown).fields : undefined,
          },
          {
            ask: askClaudeTauri,
            transcribe: async (audioRef, language) => {
              const label = language === "czech" ? "Czech" : "English";
              const t = await engine.transcribe(audioRef, { model: modelForLanguage(language) }, (p) =>
                setStep(`Transcribing · ${label} · ${Math.round((p.pct ?? 0) * 100)}%`),
              );
              await store.saveTranscript(audioRef, t);
              return transcriptText(t);
            },
            loadTranscript: async (audioRef) => {
              const t = await store.loadTranscript(audioRef);
              return t ? { text: transcriptText(t), language: transcriptLanguage(t) } : null;
            },
            status: setStep,
          },
        );
        const now = Date.now();
        await store.save(memoryFromPackage(rm, res.markdown, now));
        await store.saveTimeline(ref, [packageRestorePoint(rm, now)]);
        await store.removeRawMemory(ref); // the memory now owns media/<id>/ — kept
        reindex.request(ref);
        onNotesCreated?.([ref]);
        onTranscribed?.(); // sync: the memory + the record's tombstone reach the phone
        runningRef.current = null;
        log.info("package", "queue.done", { id: ref, done: res.done });
        setItems((prev) => prev.filter((i) => i.ref !== ref));
        if (modeRef.current === "one") setPlaying(false);
      } catch (e) {
        runningRef.current = null;
        const msg = cleanEngineError(e);
        log.error("package", "queue.error", { id: ref, error: msg });
        const rm = await store.loadRawMemory(ref).catch(() => null);
        if (rm) await store.saveRawMemory({ ...rm, status: "synced" }); // never stuck in "processing"
        setItems((prev) => prev.map((i) => (i.ref === ref ? { ...i, error: true, errorMsg: msg, phase: null, step: undefined } : i)));
        setPlaying(false);
      }
    },
    [engine, onTranscribed, onNotesCreated],
  );

  // ── one phone form session: transcript(s) → one Claude call → answers written in as plain
  // text, recording kept at the bottom, "awaiting" mark removed (forged). See lib/formFill.
  const runFormItem = useCallback(
    async (ref: string, noteId: string) => {
      log.info("form", "queue.start", { id: noteId });
      const store = getStore();
      setItems((prev) => prev.map((i) => (i.ref === ref ? { ...i, pct: 15 } : i)));
      try {
        const res = await fillFormMemory(noteId, {
          load: (id) => store.load(id),
          save: (n) => store.save(n),
          loadTranscript: (r) => store.loadTranscript(r),
          loadTimeline: (id) => store.loadTimeline(id),
          saveTimeline: (id, e) => store.saveTimeline(id, e),
          ask: askClaudeTauri,
        });
        reindex.request(noteId);
        onNotesCreated?.([noteId]); // refresh the list + reload it if it's the open memory
        onTranscribed?.(); // sync the filled memory back (the phone sees its answers)
        runningRef.current = null;
        log.info("form", "queue.done", { id: noteId, ...res });
        setItems((prev) => prev.filter((i) => i.ref !== ref));
        if (modeRef.current === "one") setPlaying(false);
      } catch (e) {
        runningRef.current = null;
        const msg = cleanEngineError(e);
        log.error("form", "queue.error", { id: noteId, error: msg });
        setItems((prev) => prev.map((i) => (i.ref === ref ? { ...i, error: true, errorMsg: msg, phase: null } : i)));
        setPlaying(false);
      }
    },
    [onTranscribed, onNotesCreated],
  );

  // ── the one-at-a-time driver — audio goes through the streaming engine; a journal
  // batch goes through processRawBatch (see runJournalItem above). Exactly one job at a
  // time either way, same Run/Pause/mode semantics for both row kinds. ──────────────
  useEffect(() => {
    if (!enabled || !playing || runningRef.current) return;
    const next = activeItem(items);
    if (!next) {
      if (items.length === 0) setPlaying(false); // nothing left → stop
      return;
    }
    runningRef.current = next.ref;

    if (isJournalItem(next)) {
      void runJournalItem(next.ref);
      return;
    }
    if (isFormItem(next)) {
      void runFormItem(next.ref, next.noteId);
      return;
    }
    if (isPackageItem(next)) {
      void runPackageItem(next.ref);
      return;
    }

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
        // A finished transcript may make a phone form session ready to fill — rescan so its
        // row joins the queue right behind (no waiting for the next sync).
        void refreshRef.current();
        if (modeRef.current === "one") setPlaying(false);
      })
      .catch((e) => {
        runningRef.current = null;
        if (isCancelled(e)) {
          // Paused by the user — not a failure. Leave the row (progress frozen); its
          // checkpoint is kept, so a later Run resumes it mid-file. The [...prev] nudge
          // re-runs the driver effect in case Run was pressed before this rejection landed.
          log.info("transcribe", "queue.paused", { ref });
          setItems((prev) => [...prev]);
          return;
        }
        const msg = cleanEngineError(e);
        log.error("transcribe", "queue.error", { ref, error: msg });
        processQueue.notifyResult(ref, false);
        setItems((prev) => prev.map((i) => (i.ref === ref ? { ...i, error: true, errorMsg: msg, phase: null } : i)));
        setPlaying(false);
      });
  }, [items, playing, enabled, engine, onTranscribed, runJournalItem, runFormItem, runPackageItem]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      const next = !p;
      if (next) {
        setItems((prev) => clearErrorsForRetry(prev)); // Run retries failed rows
      } else if (runningRef.current && engine.cancel) {
        void engine.cancel(runningRef.current); // Pause actually STOPS the active job (resumable)
      }
      return next;
    });
  }, [engine]);

  const reorder = useCallback((ref: string, pos: number) => {
    setItems((prev) => reorderItems(prev, ref, pos));
  }, []);

  const setModelFor = useCallback((ref: string, model: TranscriptionModel) => {
    setItems((prev) => setItemModel(prev, ref, model));
  }, []);

  // ── scan the vault for untranscribed audio, merging into the list ─────────
  // Persisted model/order is re-applied so a restored row keeps the model the user chose.
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const store = getStore();
    const found = await listUntranscribedAudio(titleFor, store);
    const foundBatches = await listUnprocessedRawBatches(store);
    const foundForms = await listFormsToFill(store);
    const foundPackages = await listPackagesToResolve(store);
    const persisted = loadQueueState();
    setItems((prev) => {
      const withAudio = mergeNewItems(prev, found, DEFAULT_MODEL, persisted?.rows);
      const withJournal = mergeNewJournalItems(withAudio, foundBatches, persisted?.rows);
      const withForms = mergeNewFormItems(withJournal, foundForms, persisted?.rows);
      return mergeNewPackageItems(withForms, foundPackages, persisted?.rows);
    });
  }, [enabled, titleFor]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

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
          return prev.map((i) => (i.ref === req.ref ? { ...i, model: req.model, pct: 0, error: false, errorMsg: undefined } : i));
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
    setPlaying(true); // auto path: the default model (English), start running
  }, [refresh]);

  // ── restore + auto-resume on mount ───────────────────────────────────────
  // Rebuild from the vault scan (which finds any still-untranscribed audio), re-apply the
  // saved model/order, restore the mode, and — if the queue was running when it was
  // interrupted — resume automatically (the engine picks czech-whisper back up from its
  // on-disk checkpoint, so a long job continues mid-file instead of from zero).
  const didInit = useRef(false);
  useEffect(() => {
    if (!enabled || didInit.current) return;
    didInit.current = true;
    const persisted = loadQueueState();
    if (persisted?.mode) setMode(persisted.mode);
    void refresh().then(() => {
      if (persisted?.playing) setPlaying(true);
    });
  }, [enabled, refresh]);

  // ── persist durable queue state (refs + model + order + playing + mode) ──
  // Keyed off a signature of ONLY the durable fields, so the frequent pct/phase progress
  // updates don't thrash localStorage — we save when the queue's shape or run-state changes.
  const persistSig = JSON.stringify({
    rows: items.map((i) => [i.ref, isAudioItem(i) ? i.model : undefined, i.order]),
    playing,
    mode,
  });
  useEffect(() => {
    if (!enabled) return;
    const rows: Record<string, PersistedRow> = {};
    for (const i of items) rows[i.ref] = { model: isAudioItem(i) ? i.model : undefined, order: i.order };
    saveQueueState({ rows, playing, mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistSig, enabled]);

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
