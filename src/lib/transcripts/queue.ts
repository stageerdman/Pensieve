// The transcription queue — "which saved audio still has no transcript?". This is the
// data layer behind the sync-sidebar's Transcribe queue; it is UI-free and engine-free so
// it can be unit-tested and reused (desktop sidebar now, maybe an auto-transcribe sweep
// later). The actual transcription engine is a separate module; this only decides WHAT is
// pending and labels each item with its note title.

import { getStore } from "../store";
import type { Store } from "../types";
import { parseMediaPath } from "../media/ref";
import { isAudioRef, audioRefForSidecar } from "./audioRef";

/** The slice of the store the queue needs — narrowed so tests can pass a trivial fake. */
export type QueueStore = Pick<Store, "listMedia" | "loadTranscript">;

/** One pending (untranscribed) audio file, ready to show as a queue row. */
export interface AudioQueueItem {
  ref: string; // vault-relative audio ref — the engine's input + the sidecar key
  noteId: string; // the note this audio belongs to
  title: string; // human label for the row (note title)
}

export interface AudioPartition {
  /** Every audio ref in the vault. */
  audioRefs: string[];
  /** Audio refs already transcribed, proven by a sibling sidecar in the SAME listing.
   *  (Tauri lists sidecars; the browser store keeps transcripts elsewhere, so this can
   *  under-count there — the async layer confirms the remainder via `loadTranscript`.) */
  transcribedBySidecar: Set<string>;
}

/** Pure: split a full media-ref listing into audio refs and the subset already proven
 *  transcribed by a sibling sidecar. No I/O — the async builder adds the fallback check. */
export function partitionAudioRefs(mediaRefs: string[]): AudioPartition {
  const audioRefs: string[] = [];
  const transcribedBySidecar = new Set<string>();
  for (const ref of mediaRefs) {
    if (isAudioRef(ref)) {
      audioRefs.push(ref);
      continue;
    }
    const owner = audioRefForSidecar(ref);
    if (owner) transcribedBySidecar.add(owner);
  }
  return { audioRefs, transcribedBySidecar };
}

/** Every audio file in the vault that has no transcript yet, newest-tending-first (refs
 *  carry no timestamp, so — like `listVaultImages` — this is a heuristic reversal, not a
 *  guarantee). Store-agnostic: a sidecar in the listing settles it immediately; otherwise
 *  we confirm with `loadTranscript` (covers the browser store, where sidecars live apart).
 *
 *  @param titleFor maps a noteId to its display title (the caller owns the note store).
 *  @param store   defaults to the app store; injectable for tests. */
export async function listUntranscribedAudio(
  titleFor: (noteId: string) => string,
  store: QueueStore = getStore(),
): Promise<AudioQueueItem[]> {
  const { audioRefs, transcribedBySidecar } = partitionAudioRefs(await store.listMedia());

  const out: AudioQueueItem[] = [];
  for (const ref of audioRefs) {
    if (transcribedBySidecar.has(ref)) continue; // sidecar present → already transcribed
    if ((await store.loadTranscript(ref)) !== null) continue; // browser / belt-and-braces
    const parsed = parseMediaPath(ref);
    if (!parsed) continue;
    out.push({ ref, noteId: parsed.noteId, title: titleFor(parsed.noteId) });
  }
  return out.reverse();
}
