// Module-level pub/sub so an inline audio bar (a BlockNote block, outside React's app
// tree) can command the desktop SPLIT pane to open — mirrors lightboxController. The pane
// (<TranscriptSplit>, mounted once in App) subscribes; the bar calls open()/close().
// The inline "Dropdown" reader does NOT use this — it expands locally inside the block.

import type { Transcript } from "../../lib/transcripts/types";

export interface TranscriptOpenReq {
  /** The audio's loadable src. */
  src: string;
  /** Shared-controller key (the opening block's id) so the pane + that block's inline bar
   *  drive ONE playhead — while a duplicate block on the same file stays independent. */
  playerKey?: string;
  transcript: Transcript;
  title?: string;
  /** Seconds to seek to on open (e.g. an Accio transcript-hit jump); plays once there. */
  seekTo?: number;
}

type Listener = (req: TranscriptOpenReq | null) => void;

let current: TranscriptOpenReq | null = null;
const subs = new Set<Listener>();

export const transcriptPane = {
  open(req: TranscriptOpenReq) {
    current = req;
    subs.forEach((s) => s(current));
  },
  close() {
    current = null;
    subs.forEach((s) => s(null));
  },
  get current(): TranscriptOpenReq | null {
    return current;
  },
  subscribe(l: Listener): () => void {
    subs.add(l);
    return () => subs.delete(l);
  },
};
