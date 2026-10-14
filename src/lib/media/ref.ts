// The media reference model — the data seam for all media (images now; audio/video
// later). A reference is a small typed object; its canonical serialized form is the
// vault-relative path `media/<noteId>/<mediaId>.<ext>`, which is what lands in the .md.

/** In-memory reference to one piece of media.
 *
 *  `kind` and `timecode` are present-but-unused on purpose — they are the FUTURE seam:
 *  - `kind` lets audio/video slot in next to 'image' with no schema migration.
 *  - `timecode` lets a reference point at a moment inside a video/audio clip (and, with
 *    @-mentions, lets a note reference a specific time-point of another note's media).
 *  Nothing reads them this update; do not drop them just because they're unused. */
export interface MediaRef {
  mediaId: string;
  kind: "image";
  caption?: string;
  width?: number; // display width hint (e.g. 0.25/0.5/0.75/1 of the text column); Phase 1
  timecode?: number; // FUTURE: seconds into a clip; unused for images
}

/** The single vault subfolder all media lives under: `<vault>/media/...`. */
export const MEDIA_DIR = "media";

/** Build the canonical vault-relative path for a piece of media.
 *  `media/<noteId>/<mediaId>.<ext>` — a leading dot on `ext` is tolerated. */
export function mediaRef(noteId: string, mediaId: string, ext: string): string {
  const e = ext.replace(/^\.+/, "").toLowerCase();
  return `${MEDIA_DIR}/${noteId}/${mediaId}.${e}`;
}

export interface ParsedMediaPath {
  noteId: string;
  mediaId: string;
  ext: string;
}

/** Is this string a vault-relative media path (`media/<noteId>/<file>`)? */
export function isMediaPath(path: string): boolean {
  return path.startsWith(MEDIA_DIR + "/");
}

/** Inverse of mediaRef: split a vault-relative media path back into its parts.
 *  Returns null for anything that isn't a well-formed media path. */
export function parseMediaPath(path: string): ParsedMediaPath | null {
  if (!isMediaPath(path)) return null;
  const parts = path.split("/");
  if (parts.length !== 3) return null; // media / <noteId> / <file>
  const [, noteId, file] = parts;
  const dot = file.lastIndexOf(".");
  if (!noteId || dot <= 0 || dot === file.length - 1) return null;
  return { noteId, mediaId: file.slice(0, dot), ext: file.slice(dot + 1) };
}

// A media ref inside markdown: `media/<noteId>/<mediaId>.<ext>`. Matches both the plain
// `![cap](media/…)` form and a `pensieve:gallery` fence line (`media/… | caption`). The
// character classes mirror the ids the minter/path-builder produce (base36 + punctuation).
const MEDIA_REF_RE = /media\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.[A-Za-z0-9]+/g;

/** Every vault media ref mentioned in a note's markdown (deduped, well-formed only).
 *  Used by the sync engine to pull the binaries a pulled note references. */
export function extractMediaRefs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(MEDIA_REF_RE)) {
    if (parseMediaPath(m[0])) out.add(m[0]);
  }
  return [...out];
}
