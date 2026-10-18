// Module-level seam so a BlockNote block (which lives outside React's app tree) can ask
// the sync drawer's Process queue to transcribe a recording — and hear back when it's done.
// Mirrors reindexController / transcriptController. This is why a per-block "Create /
// Regenerate transcript" now SHOWS UP in the drawer with live progress (one runner for all
// transcription), instead of the block running the engine invisibly on its own.
import type { TranscriptionModel } from "../../lib/transcripts/models";

export interface TranscribeRequest {
  ref: string;
  noteId: string;
  model: TranscriptionModel;
}

type ReqListener = (r: TranscribeRequest) => void;
type ResultListener = (ok: boolean) => void;

const reqSubs = new Set<ReqListener>();
const resultSubs = new Map<string, Set<ResultListener>>();

export const processQueue = {
  /** Ask the live queue to transcribe this recording. Returns the number of listeners that
   *  received it (0 → the queue isn't mounted, so the caller should fall back). */
  request(r: TranscribeRequest): number {
    reqSubs.forEach((f) => f(r));
    return reqSubs.size;
  },
  /** The queue hook subscribes here. */
  subscribeRequests(l: ReqListener): () => void {
    reqSubs.add(l);
    return () => reqSubs.delete(l);
  },
  /** The queue calls this when a ref finishes (ok) or fails (!ok). */
  notifyResult(ref: string, ok: boolean): void {
    resultSubs.get(ref)?.forEach((f) => f(ok));
  },
  /** A block subscribes for its own ref's outcome so it can refresh its transcript state. */
  onResult(ref: string, l: ResultListener): () => void {
    let set = resultSubs.get(ref);
    if (!set) {
      set = new Set();
      resultSubs.set(ref, set);
    }
    set.add(l);
    return () => {
      const s = resultSubs.get(ref);
      if (!s) return;
      s.delete(l);
      if (s.size === 0) resultSubs.delete(ref);
    };
  },
};
