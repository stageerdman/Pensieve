// Forms blocks in the extended-Markdown standard — the editor's `scale` and `charm` blocks
// ⇄ their `pensieve:scale` / `pensieve:charm` fences. The fence BODIES are owned by the
// shared forms module (lib/forms/fences), so desktop editor, phone and the form parser all
// read one format. Mirrors lib/md/audio's encode/reconstruct shape.

import { CHARM_LANG, SCALE_LANG, encodeCharm, encodeScale, parseCharm, parseScale } from "../forms/fences";
import { PATRONUS_LANG, encodePatronus, parsePatronus } from "../packages/patronus";

interface Block {
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: Block[];
  [k: string]: unknown;
}

const fenceText = (b: Block): string =>
  (Array.isArray(b.content) && (b.content[0] as { text?: string })?.text) || "";
const langOf = (b: Block): string | undefined =>
  b.type === "codeBlock" ? ((b.props as { language?: string } | undefined)?.language ?? undefined) : undefined;
const codeBlock = (language: string, text: string): Block => ({
  type: "codeBlock",
  props: { language },
  content: [{ type: "text", text, styles: {} }],
});

/** Editor props ⇄ scale model. `anchors` rides as a JSON string (BlockNote props are
 *  primitives); `value` 0 = unrated. */
export function scaleFromProps(p: Record<string, unknown> | undefined): { anchors: string[]; value?: number } {
  let anchors: string[] = [];
  try {
    const a = JSON.parse(String(p?.anchors ?? "[]"));
    if (Array.isArray(a)) anchors = a.map((x) => String(x ?? ""));
  } catch {
    /* malformed → empty */
  }
  const v = Number(p?.value ?? 0);
  return v >= 1 && v <= anchors.length ? { anchors, value: v } : { anchors };
}

export function scaleProps(s: { anchors: string[]; value?: number }): { anchors: string; value: number } {
  return { anchors: JSON.stringify(s.anchors), value: s.value ?? 0 };
}

export const isScaleBlock = (b: Block) => b?.type === "scale";
export const isCharmBlock = (b: Block) => b?.type === "charm";
export const isPatronusBlock = (b: Block) => b?.type === "patronus";

export function encodeScaleBlock(b: Block): Block {
  return codeBlock(SCALE_LANG, encodeScale(scaleFromProps(b.props)));
}

export function encodeCharmBlock(b: Block): Block {
  return codeBlock(CHARM_LANG, encodeCharm({ name: String(b.props?.name ?? ""), prompt: String(b.props?.prompt ?? "") }));
}

export function encodePatronusBlock(b: Block): Block {
  return codeBlock(PATRONUS_LANG, encodePatronus({ spell: "sync", instruction: String(b.props?.instruction ?? "") }));
}

export function reconstructFormFence(b: Block): Block | null {
  const lang = langOf(b);
  if (lang === SCALE_LANG) return { type: "scale", props: scaleProps(parseScale(fenceText(b))) };
  if (lang === CHARM_LANG) {
    const c = parseCharm(fenceText(b));
    return { type: "charm", props: { name: c.name, prompt: c.prompt } };
  }
  if (lang === PATRONUS_LANG) return { type: "patronus", props: { instruction: parsePatronus(fenceText(b)).instruction } };
  return null;
}
