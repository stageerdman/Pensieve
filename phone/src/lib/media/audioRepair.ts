// audioRepair.ts — the "Repair" action behind a recording that won't play.
//
// Reads the stored bytes, rebuilds them into a canonical WAV (wavRepair.ts) and writes them
// back under the SAME ref, so the note's block needs no change. The original bytes are only
// overwritten once a repaired copy exists — an unrecoverable file is left exactly as it was.

import { getMediaBytes, putMedia } from "./mediaStore";
import { repairWav } from "./wavRepair";
import { TARGET_SAMPLE_RATE } from "./pcmWav";
import { log } from "../logger";

/** repaired = new bytes written · unchanged = the file was already a sound WAV (a failed play
 *  was the player, not the file) · unrecoverable = no audio could be found · missing = no bytes. */
export type RepairOutcome = "repaired" | "unchanged" | "unrecoverable" | "missing";

export interface RepairStore {
  read: (ref: string) => Promise<Uint8Array | null>;
  write: (ref: string, blob: Blob) => Promise<boolean>;
}

const defaultStore: RepairStore = { read: getMediaBytes, write: putMedia };

export async function repairStoredAudio(ref: string, store: RepairStore = defaultStore): Promise<RepairOutcome> {
  const bytes = await store.read(ref);
  if (!bytes) return "missing";
  const repaired = repairWav(bytes, TARGET_SAMPLE_RATE);
  if (!repaired) {
    log.warn("audio", "repair.unrecoverable", { ref, size: bytes.length });
    return "unrecoverable";
  }
  if (!repaired.changed) return "unchanged";
  const ok = await store.write(ref, new Blob([repaired.bytes as BlobPart], { type: "audio/wav" }));
  if (!ok) throw new Error(`Couldn't write the repaired recording back to ${ref}`);
  log.info("audio", "repair.done", { ref, before: bytes.length, after: repaired.bytes.length });
  return "repaired";
}
