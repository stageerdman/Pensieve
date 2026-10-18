// The per-block manual "Create transcript" action — the real engine call shared by the
// audio block and the gallery audio element. Owner rule: a recording added directly in a
// note doesn't auto-transcribe; it's transcribed here on manual click (or on the next sync,
// via the drawer queue). Always the default (Czech) model — the manual button is the simple
// path; the drawer's per-row badge is where a model is chosen. Desktop-only (MLX engine).
import { getStore, isTauri } from "../../lib/store";
import { reindex } from "../../lib/search/reindexController";
import { DEFAULT_MODEL } from "../../lib/transcripts/models";
import { NativeTranscriptionEngine } from "../../lib/transcripts/nativeEngine";
import type { Transcript } from "../../lib/transcripts/types";

let engine: NativeTranscriptionEngine | null = null;

/** Transcribe one audio ref with the default model, save the sidecar, and refold search.
 *  Rejects on failure (the caller restores the idle state). */
export async function transcribeBlockAudio(ref: string, noteId: string): Promise<Transcript> {
  if (!isTauri()) throw new Error("transcription is a desktop-only capability");
  engine ??= new NativeTranscriptionEngine();
  const t = await engine.transcribe(ref, { model: DEFAULT_MODEL });
  await getStore().saveTranscript(ref, t);
  // The sidecar doesn't touch the .md/updatedAt, so refold this note's search body now.
  reindex.request(noteId);
  return t;
}
