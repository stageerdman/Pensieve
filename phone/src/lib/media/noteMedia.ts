// noteMedia.ts — the phone's media <-> markdown bridge (PURE, no DOM, no IndexedDB).
//
// The phone has no real vault and no block editor; a note's body is one plain-text string
// (`Note.c`, newline-joined). Images must still ride the SAME markdown model the desktop
// produces so they are forward-compatible the day PWA-CAPTURE / real sync lands:
//
//   • single image  →  `![caption](media/<noteId>/<mediaId>.<ext>)` on its own line
//   • gallery        →  a `pensieve:gallery` fenced block, one `ref | caption` line per
//                        image, order = line order (identical to desktop lib/md/gallery.ts)
//
// This module parses `Note.c` into a block list and serializes a block list back, so the
// same text a desktop authored renders as images here, and images authored here round-trip
// into the exact `.md` the desktop reads. The format CONSTANTS below are duplicated from the
// desktop (src/lib/md/{gallery,image}.ts) on purpose: the two apps are deliberately decoupled
// (they share only design tokens), and the desktop helpers drag the Tauri store chain, so we
// re-state the small, stable format here rather than import across the app boundary.

/** The fence language carrying an ordered image group (matches src/lib/md/gallery.ts). */
export const GALLERY_FENCE = "pensieve:gallery";
/** The ` | ` separator between a gallery line's ref and its caption (matches desktop). */
export const GALLERY_SEP = " | ";
/** The single vault subfolder all media lives under (matches src/lib/media/ref.ts). */
export const MEDIA_DIR = "media";

/** One image: a vault-relative ref (`media/...`) or a direct url (data:/blob:/http). */
export interface MediaImage {
  ref: string;
  caption?: string;
}

/** A parsed note body is a list of these blocks, in order. */
export type NoteBlock =
  | { kind: "text"; text: string }
  | { kind: "image"; ref: string; caption?: string }
  | { kind: "gallery"; images: MediaImage[] };

/** Is this a vault-relative media path (`media/<noteId>/<file>`)? Direct urls
 *  (data:/blob:/http) are NOT — they resolve as-is (external, like desktop). */
export function isMediaPath(ref: string): boolean {
  return ref.startsWith(MEDIA_DIR + "/");
}

// A single-image markdown line: `![caption](ref)` with nothing else on the line.
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)]+)\)$/;

/** Serialize one image → its markdown line. */
export function imageMd(ref: string, caption?: string): string {
  return `![${caption ?? ""}](${ref})`;
}

/** Accessible alt/aria-label for an image: the caption, or a plain "Image" fallback (never
 *  an empty alt — which marks a content image decorative — nor an opaque blob/asset URL).
 *  Matches the desktop src/lib/media/alt.ts helper (the two apps are decoupled). */
export function mediaAlt(caption?: string | null): string {
  const c = caption?.trim();
  return c ? c : "Image";
}

/** Serialize an ordered image list → the `pensieve:gallery` fenced block (as a string
 *  that may span several lines). One `ref | caption` per line; caption omitted when empty. */
export function galleryMd(images: MediaImage[]): string {
  const lines = images.map((img) => {
    const caption = (img.caption ?? "").replace(/\n/g, " ").trim();
    return caption ? `${img.ref}${GALLERY_SEP}${caption}` : img.ref;
  });
  return "```" + GALLERY_FENCE + "\n" + lines.join("\n") + "\n```";
}

/** Parse one gallery fence body (the lines between the ``` fences) → images. */
function parseGalleryLines(lines: string[]): MediaImage[] {
  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const sep = line.indexOf(GALLERY_SEP);
      if (sep === -1) return { ref: line };
      return { ref: line.slice(0, sep).trim(), caption: line.slice(sep + GALLERY_SEP.length).trim() };
    });
}

/** Parse a note body string → an ordered block list (text / image / gallery). */
export function parseNoteContent(content: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  const lines = (content ?? "").split("\n");
  const fenceOpen = "```" + GALLERY_FENCE;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === fenceOpen) {
      // collect until the closing ``` (or EOF)
      const inner: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim() === "```") break;
        inner.push(lines[j]);
      }
      const images = parseGalleryLines(inner);
      if (images.length) blocks.push({ kind: "gallery", images });
      i = j; // skip past the closing fence
      continue;
    }
    const m = line.trim().match(IMAGE_LINE);
    if (m) {
      const caption = m[1] || undefined;
      blocks.push({ kind: "image", ref: m[2].trim(), ...(caption ? { caption } : {}) });
      continue;
    }
    blocks.push({ kind: "text", text: line });
  }
  return blocks;
}

/** Serialize a block list back to a note body string (inverse of parseNoteContent). */
export function serializeBlocks(blocks: NoteBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "text") return b.text;
      if (b.kind === "image") return imageMd(b.ref, b.caption);
      return galleryMd(b.images);
    })
    .join("\n");
}

// ---- emergent gallery helpers (pure, unit-tested) ----

/** A gallery that drops to a single image collapses back to a single image block;
 *  2+ stays a gallery. Mirrors the desktop 1<->2 collapse/promote. */
export function collapseImages(images: MediaImage[]): NoteBlock | null {
  if (images.length === 0) return null;
  if (images.length === 1) return { kind: "image", ref: images[0].ref, ...(images[0].caption ? { caption: images[0].caption } : {}) };
  return { kind: "gallery", images };
}

/** Move the image at `from` to `to` (for long-press reorder). Returns a new array. */
export function reorderImages(images: MediaImage[], from: number, to: number): MediaImage[] {
  if (from < 0 || from >= images.length || to < 0 || to >= images.length || from === to) return images.slice();
  const next = images.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Decide the block for a fresh insert of `count` images with no adjacent media:
 *  1 → single image, 2+ → gallery. */
export function planInsert(images: MediaImage[]): NoteBlock | null {
  return collapseImages(images);
}

// ---- preview stripping (for the reel snippet, matches desktop src/lib/text.ts intent) ----

const GALLERY_FENCE_BLOCK = new RegExp("```" + GALLERY_FENCE + "[\\s\\S]*?```", "g");

/** Strip media markdown from a body so the reel snippet shows clean prose, not raw refs.
 *  A single image becomes its caption (or a 📷 marker); a gallery becomes a 📷 marker. */
export function stripMediaForPreview(content: string): string {
  return (content ?? "")
    .replace(GALLERY_FENCE_BLOCK, "📷 Photos")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, cap) => (cap ? `📷 ${cap}` : "📷 Photo"))
    .replace(/\n{2,}/g, "\n")
    .trim();
}
