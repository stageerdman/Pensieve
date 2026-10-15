// The "reuse an already-uploaded image" library. Lists every image already saved in the vault
// (across all notes) so the user can insert one again instead of re-uploading. Picking reuses
// the SAME ref/file — no new bytes are written, and because resolveMediaUrl registers the
// ref↔url pair, a save rewrites the picked url straight back to its vault ref (losslessly).

import { getStore } from "../../../lib/store";
import { resolveMediaUrl } from "../../../lib/media/url";
import { parseMediaPath } from "../../../lib/media/ref";

export interface LibraryImage {
  ref: string;
  url: string; // a loadable (asset/blob) url, ref↔url registered for lossless save-back
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "heic", "heif"]);

/** Vault media paths that are images (by extension). */
export function isImageRef(ref: string): boolean {
  const p = parseMediaPath(ref);
  return !!p && IMAGE_EXTS.has(p.ext.toLowerCase());
}

/** Every already-uploaded image in the vault, resolved to a loadable url. Unresolvable refs
 *  (missing files) are skipped. Reversed so the most-recently-added tend to surface first
 *  (refs carry no timestamp, so this is a heuristic, not a guarantee). */
export async function listVaultImages(): Promise<LibraryImage[]> {
  const refs = (await getStore().listMedia()).filter(isImageRef);
  const out: LibraryImage[] = [];
  for (const ref of refs) {
    const url = await resolveMediaUrl(ref);
    if (url) out.push({ ref, url });
  }
  return out.reverse();
}
