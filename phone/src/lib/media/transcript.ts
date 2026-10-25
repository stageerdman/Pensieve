// transcript.ts — the phone's transcript sidecar shape + helpers (PURE, no DOM, no store).
//
// Re-stated from src/lib/transcripts/{types,transcript}.ts rather than imported — same
// decouple convention as noteMedia.ts: the two apps share only design tokens. The sidecar
// is a JSON file next to the audio (`<audioRef>.transcript.json`), produced by the desktop's
// local whisper transcription and backed up to OneDrive as ordinary "media" (desktop's
// listMedia walks every file under media/<noteId>/, no extension filter) — so it's already
// on the remote the day a recording is. The phone just needs to know the filename convention
// to ask for it.

export interface TranscriptWord {
  w: string;
  s: number;
  e: number;
}

export interface TranscriptSegment {
  id: number;
  speaker: string | null;
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
}

export interface TranscriptMeta {
  model?: string;
  language?: string;
  transcribedAt?: string;
  durationSec?: number;
  speakers?: string[];
  diarization?: string | null;
  polished?: boolean;
}

export interface Transcript {
  version: number;
  media: string;
  meta: TranscriptMeta;
  segments: TranscriptSegment[];
}

/** The suffix that turns an audio ref into its transcript-sidecar ref (matches desktop's
 *  TRANSCRIPT_SIDECAR_SUFFIX). */
export const TRANSCRIPT_SIDECAR_SUFFIX = ".transcript.json";

/** Sidecar ref for an audio ref: `media/<note>/<id>.m4a` → `…/<id>.m4a.transcript.json`. */
export function transcriptRefFor(audioRef: string): string {
  return `${audioRef}${TRANSCRIPT_SIDECAR_SUFFIX}`;
}

/** Parse + minimally validate a transcript JSON string; null if it isn't a transcript
 *  (malformed/missing sidecar — the caller treats that as "no transcript yet"). */
export function parseTranscript(json: string): Transcript | null {
  try {
    const d = JSON.parse(json) as Transcript;
    if (d && Array.isArray(d.segments)) return d;
  } catch {
    /* malformed sidecar — treat as absent */
  }
  return null;
}
