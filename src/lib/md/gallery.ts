// The inline gallery (`imageGroup` block) in the extended-Markdown standard.
//
// A gallery is several images grouped into ONE block (see components/editor/media/
// ImageGroupBlock). Plain Markdown has no syntax for an ordered image group, so a gallery
// rides a `pensieve:gallery` fenced code block (mirroring `pensieve:image`): one line per
// image, `ref | caption` (caption optional), **display order = line order** so a reorder in
// the editor is just a line reorder in the `.md`. Round-trips losslessly.
//
//   ```pensieve:gallery
//   media/note1/a.png | a caption
//   media/note1/b.png
//   media/note1/c.png | another
//   ```
//
// Like `lib/md/image`, the block's images carry LOADABLE urls in-editor; on SAVE each url
// is rewritten → its vault ref (refForUrl), on LOAD each ref is resolved → a loadable url
// (resolveMediaUrl). Kept here in lib/md (not components) so the markdown layer never
// imports UI; the block component imports these pure helpers.

import { refForUrl, resolveMediaUrl } from "../media/url";
import { isMediaPath } from "../media/ref";

/** The fence language carrying an ordered image group. */
export const GALLERY_FENCE = "pensieve:gallery";
/** A gallery always holds at least two images (one collapses back to a single `image`). */
export const GALLERY_MIN = 2;

/** One image inside a gallery. `url` is a loadable url in-editor / a vault ref on disk.
 *  `saving` is a transient per-tile flag (never serialized) for the partial-upload state. */
export interface GalleryImage {
  url: string;
  caption?: string;
  saving?: boolean;
}

interface Block {
  type?: string;
  props?: { images?: string; height?: number; [k: string]: unknown };
  content?: unknown;
  children?: Block[];
  [k: string]: unknown;
}

/** The gallery's user-dragged display height (px). An optional leading `h=<px>` line in the fence
 *  carries it (a media ref never starts with `h=`, so it's unambiguous). 0 / absent = auto. */
const HEIGHT_LINE = /^h=(\d+)$/;

export function isImageGroupBlock(b: Block): boolean {
  return b?.type === "imageGroup";
}

/** Parse the block's `images` JSON prop → the ordered list (defensive: never throws). */
export function parseGalleryImages(json: string | undefined): GalleryImage[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.url === "string")
      .map((x) => ({
        url: x.url as string,
        ...(x.caption ? { caption: String(x.caption) } : {}),
        ...(x.saving ? { saving: true } : {}),
      }));
  } catch {
    return [];
  }
}

/** Serialize the ordered list → the `images` JSON prop (drops the transient `saving` flag
 *  only when asked; the editor keeps it, SAVE strips it via encodeImageGroupBlock). */
export function stringifyGalleryImages(images: GalleryImage[]): string {
  return JSON.stringify(
    images.map((i) => ({ url: i.url, ...(i.caption ? { caption: i.caption } : {}), ...(i.saving ? { saving: true } : {}) })),
  );
}

const fenceText = (b: Block): string =>
  (Array.isArray(b.content) && (b.content[0] as { text?: string })?.text) || "";

/** SAVE: rewrite each image's url → its vault ref, then emit the `pensieve:gallery` fence.
 *  One line per image, `ref | caption` (caption omitted when empty); order preserved. */
export function encodeImageGroupBlock(b: Block): Block {
  const images = parseGalleryImages(b.props?.images);
  const lines = images.map((img) => {
    // The inverse of load-time resolution; an external/unresolved url is kept as-is.
    const ref = refForUrl(img.url) ?? img.url;
    const caption = (img.caption ?? "").replace(/\n/g, " ").trim();
    return caption ? `${ref} | ${caption}` : ref;
  });
  const height = Math.round(Number(b.props?.height) || 0);
  if (height > 0) lines.unshift(`h=${height}`);
  return { type: "codeBlock", props: { language: GALLERY_FENCE }, content: [{ type: "text", text: lines.join("\n"), styles: {} }] };
}

/** LOAD: a `pensieve:gallery` fence → an imageGroup block (refs, order preserved), else null. */
export function reconstructGalleryFence(b: Block): Block | null {
  const lang = b.type === "codeBlock" && (b.props as { language?: string } | undefined)?.language;
  if (lang !== GALLERY_FENCE) return null;
  const rawLines = fenceText(b)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  let height = 0;
  if (rawLines.length && HEIGHT_LINE.test(rawLines[0])) {
    height = Number(HEIGHT_LINE.exec(rawLines[0])![1]);
    rawLines.shift();
  }
  const images: GalleryImage[] = rawLines.map((line) => {
    const sep = line.indexOf(" | ");
    if (sep === -1) return { url: line };
    return { url: line.slice(0, sep).trim(), caption: line.slice(sep + 3).trim() };
  });
  const props: { images: string; height?: number } = { images: stringifyGalleryImages(images) };
  if (height > 0) props.height = height;
  return { type: "imageGroup", props };
}

/** LOAD: resolve an imageGroup block's refs → loadable urls (new object; registers the
 *  pairing so SAVE's refForUrl rewrite is lossless). A missing/external url is kept as-is
 *  (the tile shows the broken state; the ref still round-trips on the next save). */
export async function resolveGalleryBlock(b: Block): Promise<Block> {
  const images = parseGalleryImages(b.props?.images);
  const resolved = await Promise.all(
    images.map(async (img) => {
      if (!isMediaPath(img.url)) return img;
      const url = await resolveMediaUrl(img.url);
      return { ...img, url: url ?? img.url };
    }),
  );
  return { ...b, props: { ...b.props, images: stringifyGalleryImages(resolved) } };
}
