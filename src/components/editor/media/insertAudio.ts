// Audio insert funnel — mirrors insertImage's saveImageFile, with an audio MIME→ext map.
// Used by the empty audio-block placeholder (choose a file) now, and by recording (P4).
// Bytes flow through the same store.saveMedia → resolveMediaUrl path as images.

import { getStore } from "../../../lib/store";
import { resolveMediaUrl } from "../../../lib/media/url";
import { log } from "../../../lib/logger";

const AUDIO_MIME_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
};

/** A sensible file extension for a chosen/recorded audio file (from name, else mime).
 *  Recorder blobs carry a parameterised type like "audio/webm;codecs=opus" — strip the
 *  params before the lookup so they don't fall through to the mp3 default. */
export function audioExtForFile(file: File | Blob): string {
  const name = (file as File).name ?? "";
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase();
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  return AUDIO_MIME_EXT[mime] ?? "mp3";
}

/** Save audio bytes → vault ref, resolve ref → loadable url (registers the pair for save). */
export async function saveAudioFile(
  noteId: string,
  file: File | Blob,
): Promise<{ ref: string; url: string | null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ref = await getStore().saveMedia(noteId, bytes, audioExtForFile(file));
  const url = await resolveMediaUrl(ref);
  log.info("media", "audio.save", { ref });
  return { ref, url };
}
