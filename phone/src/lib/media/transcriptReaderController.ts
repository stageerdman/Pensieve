// transcriptReaderController.ts — a module-level pub/sub so the imperatively-built audio
// block (components/note/mediaDom.ts, outside the React tree) can summon the full-screen
// "Spotify-style" transcript reader. Mirrors lightboxController.ts's pattern exactly. One
// <PhoneTranscriptReader/> mounted at the app root subscribes and renders.

import type { Transcript } from "./transcript";

export interface TranscriptReaderState {
  open: boolean;
  ref: string; // the audio ref — the shared audioController key, so playback continues seamlessly
  src: string; // the resolved playable url
  transcript: Transcript | null;
  caption?: string;
}

type Listener = (s: TranscriptReaderState) => void;

const CLOSED: TranscriptReaderState = { open: false, ref: "", src: "", transcript: null };
let state: TranscriptReaderState = CLOSED;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(state);
}

export const phoneTranscriptReader = {
  open(opts: { ref: string; src: string; transcript: Transcript | null; caption?: string }) {
    state = { open: true, ...opts };
    emit();
  },
  close() {
    if (!state.open) return;
    state = { ...state, open: false };
    emit();
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },
  get(): TranscriptReaderState {
    return state;
  },
};
