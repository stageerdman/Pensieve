// Audio-reference predicates — pure, framework-free. Decide which vault media paths are
// audio, and recognise/invert the transcript-sidecar naming. Used by the transcription
// queue (which audio still needs transcribing) and anything else that reasons about audio
// refs. Kept separate from the image predicate (mediaLibrary.isImageRef) so the lib layer
// never has to reach up into the editor component layer.

import { parseMediaPath } from "../media/ref";
import { TRANSCRIPT_SIDECAR_SUFFIX } from "./transcript";

// The audio container extensions Pensieve accepts. Mirrors the MIME→ext targets in
// `components/editor/media/insertAudio.ts` (AUDIO_MIME_EXT) plus the recorder's `.webm`
// output — if that accept-set grows, grow this to match.
export const AUDIO_EXTS = new Set(["mp3", "m4a", "aac", "wav", "webm", "ogg", "flac"]);

/** Vault media paths that are audio (by extension). */
export function isAudioRef(ref: string): boolean {
  const p = parseMediaPath(ref);
  return !!p && AUDIO_EXTS.has(p.ext.toLowerCase());
}

/** Is this path a transcript sidecar (`<audioRef>.transcript.json`)? */
export function isTranscriptSidecar(path: string): boolean {
  return path.endsWith(TRANSCRIPT_SIDECAR_SUFFIX);
}

/** The audio ref a sidecar path belongs to — inverse of `transcriptRefFor` — or null if
 *  `path` isn't a sidecar. */
export function audioRefForSidecar(path: string): string | null {
  if (!isTranscriptSidecar(path)) return null;
  return path.slice(0, -TRANSCRIPT_SIDECAR_SUFFIX.length);
}
