// Callouts in the extended-Markdown standard — a quiet box around a few blocks, with an
// optional emoji. Written by the Notion importer (593 of them) and by `/callout`:
//
//   ```pensieve:callout
//   icon=🚨                 ← optional first line
//   body markdown…           ← the editor's own markdown (blocksToExtendedMd), never a fence
//   ```
//
// This module owns the FENCE TEXT only (icon line ⇄ body), so desktop editor, phone and the
// search/preview helpers read one format. The body ⇄ blocks bridge needs the editor's
// converter and lives in extended.ts (like pensieve:toggle).

export const CALLOUT_FENCE = "pensieve:callout";

const ICON_LINE = /^icon=(.+)$/;

export interface CalloutText {
  /** The emoji (any), or "" for none. */
  icon: string;
  /** The body markdown (no trailing newline). */
  body: string;
}

/** Fence text → icon + body. A first line `icon=<emoji>` is the icon; everything else is body. */
export function parseCalloutText(text: string): CalloutText {
  const nl = text.indexOf("\n");
  const first = nl === -1 ? text : text.slice(0, nl);
  const m = ICON_LINE.exec(first);
  if (!m) return { icon: "", body: text };
  return { icon: m[1].trim(), body: nl === -1 ? "" : text.slice(nl + 1) };
}

/** Icon + body → fence text (inverse of parseCalloutText). */
export function encodeCalloutText({ icon, body }: CalloutText): string {
  if (!icon) return body;
  return body ? `icon=${icon}\n${body}` : `icon=${icon}`;
}
