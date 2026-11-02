// Video blocks in the extended-Markdown standard — mirrors lib/md/audio (video has no
// width/aspect geometry of its own either; its box is a fixed poster-frame aspect, read
// straight off the file, not a user-adjustable shape). The editor holds a custom `video`
// block whose `url` prop is a LOADABLE url; the `.md` must carry the vault-relative ref.
// Video has no plain CommonMark form, so it ALWAYS rides a `pensieve:video` fence:
//
//   ```pensieve:video
//   media/<noteId>/<mediaId>.mov
//   optional caption (remaining lines)
//   ```
//
// The transcript is a SEPARATE sidecar keyed off the ref (see lib/transcripts) — exactly
// the same convention as audio, deliberately NOT written into the .md.

import { refForUrl } from "../media/url";

export const VIDEO_FENCE = "pensieve:video";

interface Block {
  type?: string;
  props?: { url?: string; caption?: string; [k: string]: unknown };
  content?: unknown;
  children?: Block[];
  [k: string]: unknown;
}

export function isVideoBlock(b: Block): boolean {
  return b?.type === "video";
}

const fenceText = (b: Block): string =>
  (Array.isArray(b.content) && (b.content[0] as { text?: string })?.text) || "";

/** SAVE: rewrite the video block's url → its vault ref and emit a `pensieve:video` fence. */
export function encodeVideoBlock(b: Block): Block {
  const url = b.props?.url ?? "";
  const ref = refForUrl(url) ?? url; // external/unresolved urls pass through unchanged
  const caption = b.props?.caption ?? "";
  const text = caption ? `${ref}\n${caption}` : ref;
  return { type: "codeBlock", props: { language: VIDEO_FENCE }, content: [{ type: "text", text, styles: {} }] };
}

/** LOAD: a `pensieve:video` fence → a video block, or null if it isn't one. */
export function reconstructVideoFence(b: Block): Block | null {
  const lang = b.type === "codeBlock" && (b.props as { language?: string } | undefined)?.language;
  if (lang !== VIDEO_FENCE) return null;
  const lines = fenceText(b).split("\n");
  const url = lines[0] ?? "";
  const caption = lines.slice(1).join("\n");
  return { type: "video", props: { url, caption } };
}
