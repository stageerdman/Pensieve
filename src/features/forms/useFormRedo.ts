import { useCallback, useEffect, useState } from "react";
import type { Note } from "../../lib/types";
import { getStore } from "../../lib/store";
import { canRedo, resetForRedo } from "../../lib/formFill/redo";
import { chooseTranscriptionModel } from "../../components/transcription/chooseModel";
import { processQueue } from "../../components/transcription/processQueueController";
import { log } from "../../lib/logger";

// "Redo with AI…" for a filled form memory (memory ⋯ menu). One question (which language),
// then: the AI result → Timeline, the memory goes back to what the phone sent, its
// recording re-transcribes with that language in the sync drawer, and the fill re-runs by
// itself (the queue holds the form row until the new transcript exists). See lib/formFill/redo.

interface Deps {
  note: Note | null;
  loadEpoch: number;
  flush: () => Promise<void>;
  reloadFromDisk: (id: string) => Promise<void>;
}

export function useFormRedo({ note, loadEpoch, flush, reloadFromDisk }: Deps) {
  const [available, setAvailable] = useState(false);
  const id = note?.id;
  const extra = note?.extra;

  useEffect(() => {
    let live = true;
    if (!note) return setAvailable(false);
    void getStore()
      .loadTimeline(note.id)
      .then((entries) => live && setAvailable(canRedo(note, entries)));
    return () => {
      live = false;
    };
    // Re-check when the memory, its status, or its body (a fill / redo remount) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, extra, loadEpoch]);

  const run = useCallback(async () => {
    if (!id) return;
    const model = await chooseTranscriptionModel();
    if (!model) return;
    await flush(); // the latest edits are part of what goes to the Timeline
    const store = getStore();
    const refs = await resetForRedo(id, {
      load: (x) => store.load(x),
      save: (n) => store.save(n),
      loadTimeline: (x) => store.loadTimeline(x),
      saveTimeline: (x, e) => store.saveTimeline(x, e),
    });
    if (!refs) return;
    await reloadFromDisk(id);
    log.info("form", "redo", { id, model, recordings: refs.length });
    for (const ref of refs) processQueue.request({ ref, noteId: id, model });
  }, [id, flush, reloadFromDisk]);

  return { available, run };
}
