// Audio blocks in the extended-Markdown standard — mirrors lib/md/image, simpler (audio
// has no width/aspect geometry). The editor holds a custom `audio` block whose `url` prop
// is a LOADABLE url; the `.md` must carry the vault-relative ref. Audio has no plain
// CommonMark form, so it ALWAYS rides a `pensieve:audio` fence:
//
//   ```pensieve:audio
//   media/<noteId>/<mediaId>.mp3
//   optional caption (remaining lines)
//   ```
//
// The transcript is a SEPARATE sidecar keyed off the ref (see lib/transcripts) — it is
// deliberately NOT written into the .md.

import { refForUrl } from "../media/url";

export const AUDIO_FENCE = "pensieve:audio";

interface Block {
  type?: string;
  props?: { url?: string; caption?: string; [k: string]: unknown };
  content?: unknown;
  children?: Block[];
  [k: string]: unknown;
}

export function isAudioBlock(b: Block): boolean {
  return b?.type === "audio";
}

const fenceText = (b: Block): string =>
  (Array.isArray(b.content) && (b.content[0] as { text?: string })?.text) || "";

/** SAVE: rewrite the audio block's url → its vault ref and emit a `pensieve:audio` fence. */
export function encodeAudioBlock(b: Block): Block {
  const url = b.props?.url ?? "";
  const ref = refForUrl(url) ?? url; // external/unresolved urls pass through unchanged
  const caption = b.props?.caption ?? "";
  const text = caption ? `${ref}\n${caption}` : ref;
  return { type: "codeBlock", props: { language: AUDIO_FENCE }, content: [{ type: "text", text, styles: {} }] };
}

/** LOAD: a `pensieve:audio` fence → an audio block, or null if it isn't one. */
export function reconstructAudioFence(b: Block): Block | null {
  const lang = b.type === "codeBlock" && (b.props as { language?: string } | undefined)?.language;
  if (lang !== AUDIO_FENCE) return null;
  const lines = fenceText(b).split("\n");
  const url = lines[0] ?? "";
  const caption = lines.slice(1).join("\n");
  return { type: "audio", props: { url, caption } };
}
