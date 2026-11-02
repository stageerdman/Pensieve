// Video blocks in the extended-Markdown standard — mirrors lib/md/audio. Unlike Image,
// a video's displayed ASPECT is always its own natural one (no corner-reshape/crop/pan —
// cropping every frame of a clip isn't the same simple operation as cropping one photo);
// only its WIDTH is adjustable, reusing the same width scale Image uses. The editor holds
// a custom `video` block whose `url` prop is a LOADABLE url; the `.md` must carry the
// vault-relative ref. Video has no plain CommonMark form, so it ALWAYS rides a
// `pensieve:video` fence, with an optional `width=<n>` params line when non-default
// (mirrors `pensieve:image`'s params line, minus `aspect`/`posX`/`posY`):
//
//   ```pensieve:video
//   media/<noteId>/<mediaId>.mov
//   width=0.5
//   optional caption (remaining lines)
//   ```
//
// The transcript is a SEPARATE sidecar keyed off the ref (see lib/transcripts) — exactly
// the same convention as audio, deliberately NOT written into the .md.

import { refForUrl } from "../media/url";

export const VIDEO_FENCE = "pensieve:video";
/** Mirrors mediaShape.DEFAULT_WIDTH (kept local — lib/md stays free of UI imports). */
export const DEFAULT_VIDEO_WIDTH = 0.75;

interface Block {
  type?: string;
  props?: { url?: string; caption?: string; width?: number; [k: string]: unknown };
  content?: unknown;
  children?: Block[];
  [k: string]: unknown;
}

export function isVideoBlock(b: Block): boolean {
  return b?.type === "video";
}

const fenceText = (b: Block): string =>
  (Array.isArray(b.content) && (b.content[0] as { text?: string })?.text) || "";

function isDefaultWidth(w: number | undefined): boolean {
  return w === undefined || Math.abs(w - DEFAULT_VIDEO_WIDTH) < 1e-6;
}

/** SAVE: rewrite the video block's url → its vault ref and emit a `pensieve:video` fence
 *  (ref, an optional `width=` params line when non-default, then the caption). */
export function encodeVideoBlock(b: Block): Block {
  const url = b.props?.url ?? "";
  const ref = refForUrl(url) ?? url; // external/unresolved urls pass through unchanged
  const caption = b.props?.caption ?? "";
  const width = b.props?.width;
  const lines = [ref];
  if (!isDefaultWidth(width)) lines.push(`width=${width}`);
  if (caption) lines.push(caption);
  return { type: "codeBlock", props: { language: VIDEO_FENCE }, content: [{ type: "text", text: lines.join("\n"), styles: {} }] };
}

/** LOAD: a `pensieve:video` fence → a video block, or null if it isn't one. */
export function reconstructVideoFence(b: Block): Block | null {
  const lang = b.type === "codeBlock" && (b.props as { language?: string } | undefined)?.language;
  if (lang !== VIDEO_FENCE) return null;
  const lines = fenceText(b).split("\n");
  const url = lines[0] ?? "";
  let width = DEFAULT_VIDEO_WIDTH;
  let captionStart = 1;
  const widthMatch = /^width=([\d.]+)$/.exec(lines[1] ?? "");
  if (widthMatch) {
    width = Number(widthMatch[1]);
    captionStart = 2;
  }
  const caption = lines.slice(captionStart).join("\n");
  return { type: "video", props: { url, caption, width: Number.isFinite(width) ? width : DEFAULT_VIDEO_WIDTH } };
}
