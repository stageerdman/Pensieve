// Transcript helpers — pure, framework-free (shared by the view, search, and later the
// phone app). Path convention, plaintext extraction (for the search corpus), safe parse,
// and the SEGMENT-AWARE playback sync.

import type { Transcript } from "./types";

/** The suffix that turns an audio ref into its transcript-sidecar path. The single source
 *  of truth for the sidecar naming convention (built by `transcriptRefFor`, recognised by
 *  the transcription queue). */
export const TRANSCRIPT_SIDECAR_SUFFIX = ".transcript.json";

/** Sidecar path for an audio ref: `media/<note>/<id>.mp3` → `…/<id>.mp3.transcript.json`.
 *  The `.ext` is kept so `a.mp3`/`a.wav` with the same stem don't collide. */
export function transcriptRefFor(audioRef: string): string {
  return `${audioRef}${TRANSCRIPT_SIDECAR_SUFFIX}`;
}

/** The searchable text of a transcript (segment texts joined) — folded into a note's
 *  body in the search index so spoken words are findable in Accio. */
export function transcriptPlainText(t: Transcript): string {
  return t.segments.map((s) => s.text).join(" ");
}

/** Parse + minimally validate a transcript JSON string; null if it isn't a transcript. */
export function parseTranscript(json: string): Transcript | null {
  try {
    const d = JSON.parse(json) as Transcript;
    if (d && Array.isArray(d.segments)) return d;
  } catch {
    /* malformed sidecar — treat as absent */
  }
  return null;
}

// ── Segment-aware sync ───────────────────────────────────────────────────────
// A FLAT word-level binary search assumes globally monotonic word start times. With
// `diarization: "multitrack"` the two speakers' words overlap, so flat search steps
// BACKWARD at the seams and mis-highlights. Correct model: binary-search the (monotonic)
// SEGMENT starts to find the active segment, THEN the word within it. (Update lesson P1.)

/** The active segment for `time`: the last segment whose `start <= time`. Returns -1 if
 *  time precedes the first segment. Assumes segments are ordered by `start`. */
function activeSegmentIndex(t: Transcript, time: number): number {
  const segs = t.segments;
  let lo = 0;
  let hi = segs.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= time) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export interface SyncPoint {
  segIndex: number;
  wordIndex: number;
}

/** The active (segment, word) at `time`, or null before the first segment. The word is
 *  the one whose `[s, e)` contains time; before the first word's start → word 0; after the
 *  last → the last word (so the highlight never jumps backward within a segment). */
export function syncAt(t: Transcript, time: number): SyncPoint | null {
  const segIndex = activeSegmentIndex(t, time);
  if (segIndex < 0) return null;
  const words = t.segments[segIndex].words;
  if (!words.length) return { segIndex, wordIndex: 0 };
  // Linear-ish within a segment (words are small); monotonic by construction.
  let wordIndex = 0;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].s) wordIndex = i;
    else break;
  }
  return { segIndex, wordIndex };
}

/** Start time (seconds) of a given (segment, word) — used by click-to-seek. */
export function wordStart(t: Transcript, segIndex: number, wordIndex: number): number {
  const seg = t.segments[segIndex];
  if (!seg) return 0;
  const word = seg.words[wordIndex];
  return word ? word.s : seg.start;
}

/** A stable flat index for a (segment, word) — handy for the view's highlight state. */
export function flatWordIndex(t: Transcript, segIndex: number, wordIndex: number): number {
  let n = 0;
  for (let i = 0; i < segIndex && i < t.segments.length; i++) n += t.segments[i].words.length;
  return n + wordIndex;
}
