// Image blocks in the extended-Markdown standard.
//
// The editor holds a custom `image` block (see components/editor/media/ImageBlock)
// whose `url` prop is a LOADABLE url (a Tauri asset url / browser blob url / an external
// https url). The `.md` on disk must instead carry the vault-relative ref
// (`media/<noteId>/<mediaId>.<ext>`), so:
//   • on SAVE  we rewrite each image block's url → ref (refForUrl) and either let it
//     serialize natively as plain `![caption](ref)` (the common, default-width case) or,
//     when the width isn't default, bridge it through a `pensieve:image` fence (plain
//     `![]()` can't carry a width);
//   • on LOAD  the fence is rebuilt into an image block, and every image block's ref is
//     resolved → a loadable url (resolveMediaUrl, which also registers the ref↔url pair
//     so SAVE's refForUrl lookup is lossless).
//
// Kept here in lib/md (not components) so the markdown layer never imports UI.

import { refForUrl, resolveMediaUrl } from "../media/url";
import { isMediaPath, parseMediaPath } from "../media/ref";
import { isImageGroupBlock, resolveGalleryBlock } from "./gallery";

/** The default display width — 75% of the text column (wiki "Desktop single image"). */
export const DEFAULT_IMAGE_WIDTH = 0.75;
/** The fence language carrying a non-default width (plain `![]()` can't). */
export const IMAGE_FENCE = "pensieve:image";

interface Block {
  type?: string;
  props?: { url?: string; caption?: string; width?: number; [k: string]: unknown };
  content?: unknown;
  children?: Block[];
  [k: string]: unknown;
}

export function isImageBlock(b: Block): boolean {
  return b?.type === "image";
}

function isDefaultWidth(w: number | undefined): boolean {
  return w === undefined || Math.abs(w - DEFAULT_IMAGE_WIDTH) < 1e-6;
}

/** SAVE: rewrite an image block's url → its vault ref, then return the block to serialize.
 *  Default width → the bare image block (serializes natively to `![caption](ref)`).
 *  Non-default width → a `pensieve:image` fence carrying ref, width, caption. */
export function encodeImageBlock(b: Block): Block {
  const url = b.props?.url ?? "";
  // The inverse of load-time resolution. An external url (pasted https link) or an
  // un-resolved ref isn't in the registry → keep the string as-is (external image).
  const ref = refForUrl(url) ?? url;
  const caption = b.props?.caption ?? "";
  const width = b.props?.width;

  if (isDefaultWidth(width)) {
    // Minimal props so toExternalHTML emits a clean `<img src alt>` → `![caption](ref)`.
    return { type: "image", props: { url: ref, caption, width: DEFAULT_IMAGE_WIDTH } };
  }
  // ref \n width \n caption(rest) — caption is single-line (the editor's input is).
  const text = `${ref}\n${width}${caption ? `\n${caption}` : ""}`;
  return { type: "codeBlock", props: { language: IMAGE_FENCE }, content: [{ type: "text", text, styles: {} }] };
}

const fenceText = (b: Block): string =>
  (Array.isArray(b.content) && (b.content[0] as { text?: string })?.text) || "";

/** LOAD: a `pensieve:image` fence → an image block (width preserved), or null if not one. */
export function reconstructImageFence(b: Block): Block | null {
  const lang = b.type === "codeBlock" && (b.props as { language?: string } | undefined)?.language;
  if (lang !== IMAGE_FENCE) return null;
  const lines = fenceText(b).split("\n");
  const url = lines[0] ?? "";
  const width = Number(lines[1]);
  const caption = lines.slice(2).join("\n");
  return {
    type: "image",
    props: { url, caption, width: Number.isFinite(width) ? width : DEFAULT_IMAGE_WIDTH },
  };
}

/** LOAD: resolve every image block's vault ref → a loadable url, in place (new objects).
 *  Runs INSIDE extendedMdToBlocks, before the blocks are mounted, so the async resolution
 *  never trips a post-mount dirty / undo step (the loadBlocksWithoutHistory contract). A
 *  missing file or external url keeps its original string — the UI shows the broken state;
 *  the ref still round-trips on the next save. */
export async function resolveImageUrls(blocks: Block[]): Promise<Block[]> {
  const out: Block[] = [];
  for (const b of blocks) {
    let nb: Block = b;
    if (isImageBlock(b) && isMediaPath(b.props?.url ?? "")) {
      const resolved = await resolveMediaUrl(b.props!.url!);
      nb = { ...b, props: { ...b.props, url: resolved ?? b.props!.url } };
    } else if (isImageGroupBlock(b)) {
      nb = (await resolveGalleryBlock(b)) as Block;
    }
    if (Array.isArray(nb.children) && nb.children.length) {
      nb = { ...nb, children: await resolveImageUrls(nb.children) };
    }
    out.push(nb);
  }
  return out;
}

/** The on-disk filename (`<mediaId>.<ext>`) for an image url/ref — for the broken state. */
export function imageFilename(urlOrRef: string): string {
  const ref = refForUrl(urlOrRef) ?? urlOrRef;
  const parsed = parseMediaPath(ref);
  return parsed ? `${parsed.mediaId}.${parsed.ext}` : "";
}
