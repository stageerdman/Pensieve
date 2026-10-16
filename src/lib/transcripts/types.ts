// The transcript data model — the LOCKED sidecar schema (see the update's wiki.md). A
// transcript is a sidecar file keyed off an audio ref, NOT part of the .md. The future
// transcription step (whisper) emits exactly this shape; the UI + search consume it.

export interface TranscriptWord {
  w: string; // the word text
  s: number; // start seconds
  e: number; // end seconds
}

export interface TranscriptSegment {
  id: number;
  speaker: string | null; // null if undiarized
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[]; // word-level timings drive the word-by-word highlight
}

export interface TranscriptMeta {
  model?: string;
  language?: string;
  transcribedAt?: string;
  durationSec?: number;
  speakers?: string[];
  diarization?: string | null; // "multitrack" | "mono" | null
  polished?: boolean;
}

export interface Transcript {
  version: number;
  media: string; // the media ref/stem this belongs to
  meta: TranscriptMeta;
  segments: TranscriptSegment[];
}
