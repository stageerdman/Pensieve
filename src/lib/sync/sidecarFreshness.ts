// sidecarFreshness.ts — PURE: does a backed-up media file need uploading again?
//
// Media is content-addressed (a ref never changes its bytes) EXCEPT a transcript sidecar:
// re-transcribing a recording rewrites `<audio>.transcript.json` in place. Treating it as
// "backed up forever" left OneDrive (and so the phone) with the first, wrong-language
// transcript (2026-11-20). A sidecar whose local size differs from the size last synced —
// or that was never recorded with one — goes up again.

import { TRANSCRIPT_SIDECAR_SUFFIX } from "../transcripts/transcript";
import type { MediaSyncRecord } from "./types";

export function isRewrittenSidecar(ref: string, rec: MediaSyncRecord | undefined, localSize: number | null): boolean {
  if (!rec?.backedUp || !ref.endsWith(TRANSCRIPT_SIDECAR_SUFFIX) || localSize == null) return false;
  return rec.size !== localSize;
}
