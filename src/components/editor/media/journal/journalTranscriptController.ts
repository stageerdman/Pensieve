// The journal counterpart to ../../audio/transcriptController — a module-level pub/sub so
// the Journal block (outside any shared React tree with the split pane) can open it. Not
// unified with the audio/video transcriptController: that one is built around ONE shared
// playback controller (getController(key, src)) driving word-level sync to audio time —
// a journal page has no audio, no time axis, nothing to sync to. This is deliberately
// simpler: just an ordered list of pages to scrub through by tapping prev/next.

export interface JournalTranscriptPage {
  ref: string; // vault-relative media ref — the key loadTranscript reads the sidecar from
  url: string; // the loadable image url, for the pane's own small page preview
  caption?: string;
}

export interface JournalTranscriptOpenReq {
  pages: JournalTranscriptPage[];
  index: number;
  title?: string;
}

type Listener = (open: JournalTranscriptOpenReq | null) => void;
const listeners = new Set<Listener>();
let current: JournalTranscriptOpenReq | null = null;

export const journalTranscriptPane = {
  open(req: JournalTranscriptOpenReq): void {
    current = req;
    for (const fn of listeners) fn(current);
  },
  close(): void {
    current = null;
    for (const fn of listeners) fn(null);
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get currentReq(): JournalTranscriptOpenReq | null {
    return current;
  },
};
