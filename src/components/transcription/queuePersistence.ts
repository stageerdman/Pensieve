// Persist the Process queue so transcription survives an app quit / crash / interruption.
// Device-local UI state (which audio is queued, each row's model + order, and whether the
// queue was running) → localStorage, never the vault. The heavy state — actual mid-file
// progress — lives in the engine's on-disk checkpoint; this only records the light metadata
// needed to rebuild the queue and auto-resume. On reopen: the untranscribed-audio scan finds
// the same files, we re-apply the saved model/order, and if the queue was `playing` we resume.

import { log } from "../../lib/logger";
import type { TranscriptionModel } from "../../lib/transcripts/models";
import type { QueueMode } from "./queueOps";

const KEY = "pensieve:transcription:queue";

/** Per-ref durable row state (NOT progress — that's in the engine checkpoint). */
export interface PersistedRow {
  model: TranscriptionModel;
  order: number;
}

export interface PersistedQueue {
  rows: Record<string, PersistedRow>;
  playing: boolean;
  mode: QueueMode;
}

export function loadQueueState(): PersistedQueue | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PersistedQueue>;
    const rows: Record<string, PersistedRow> = {};
    for (const [ref, r] of Object.entries(p.rows ?? {})) {
      if (r && (r.model === "czech-whisper" || r.model === "parakeet") && typeof r.order === "number") {
        rows[ref] = { model: r.model, order: r.order };
      }
    }
    return { rows, playing: !!p.playing, mode: p.mode === "one" ? "one" : "all" };
  } catch {
    log.warn("transcribe", "queue.persist.load.failed");
    return null;
  }
}

export function saveQueueState(q: PersistedQueue): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    log.warn("transcribe", "queue.persist.save.failed");
  }
}
