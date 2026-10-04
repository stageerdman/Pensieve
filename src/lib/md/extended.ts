// Pensieve extended-Markdown standard.
//
// `.md` on disk is the source of truth. BlockNote's built-in Markdown converter
// handles the standard block set faithfully (verified idempotent — see the P2
// spike), but it has no syntax for inline colours. Rather than lose that info
// (BlockNote's Markdown drops text/background colour), we OWN the standard:
// coloured runs are bridged at the BLOCK level, around BlockNote's converter, so
// the `.md` string stays lossless.
//
// v1 standard — inline colour runs (text colour and/or highlight/background):
//   {fg:red}text{/}            red text
//   {bg:yellow}text{/}         yellow highlight
//   {fg:red bg:yellow}text{/}  both
// Colour names are BlockNote's palette names. "default" is never written.

/** The two BlockNote converter methods we depend on (client editor or server-util).
 *  The client editor returns these synchronously; server-util returns Promises —
 *  we accept either and `await` at the call sites. */
export interface MdEditor {
  blocksToMarkdownLossy(blocks?: unknown[]): string | Promise<string>;
  tryParseMarkdownToBlocks(markdown: string): unknown[] | Promise<unknown[]>;
}

interface TextInline {
  type: "text";
  text: string;
  styles?: Record<string, unknown> & { textColor?: string; backgroundColor?: string };
}
type Inline = TextInline | { type: string; [k: string]: unknown };
interface Block {
  content?: unknown;
  children?: Block[];
  [k: string]: unknown;
}

function isText(i: Inline): i is TextInline {
  return i?.type === "text" && typeof (i as TextInline).text === "string";
}

const colorOf = (v?: string) => (v && v !== "default" ? v : null);

/** blocks -> md: wrap coloured runs in {fg:.. bg:..}…{/}, dropping the colour styles. */
export function encodeInline(items: Inline[]): Inline[] {
  return items.map((it) => {
    if (!isText(it) || !it.styles) return it;
    const fg = colorOf(it.styles.textColor);
    const bg = colorOf(it.styles.backgroundColor);
    if (!fg && !bg) return it;
    const { textColor, backgroundColor, ...rest } = it.styles;
    const attrs = [fg && `fg:${fg}`, bg && `bg:${bg}`].filter(Boolean).join(" ");
    return { ...it, text: `{${attrs}}${it.text}{/}`, styles: rest };
  });
}

const RUN = /\{((?:fg:[\w-]+)?(?:\s)?(?:bg:[\w-]+)?)\}([\s\S]*?)\{\/\}/g;

/** md -> blocks: turn {fg:.. bg:..}…{/} runs back into colour-styled text. */
export function decodeInline(items: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    if (!isText(it) || !/\{(?:fg|bg):/.test(it.text)) {
      out.push(it);
      continue;
    }
    const text = it.text;
    let last = 0;
    let matched = false;
    for (let m = RUN.exec(text); m !== null; m = RUN.exec(text)) {
      matched = true;
      if (m.index > last) out.push({ ...it, text: text.slice(last, m.index) });
      const styles = { ...(it.styles ?? {}) };
      const fg = m[1].match(/fg:([\w-]+)/);
      const bg = m[1].match(/bg:([\w-]+)/);
      if (fg) styles.textColor = fg[1];
      if (bg) styles.backgroundColor = bg[1];
      out.push({ ...it, text: m[2], styles });
      last = m.index + m[0].length;
    }
    RUN.lastIndex = 0;
    if (!matched) out.push(it);
    else if (last < text.length) out.push({ ...it, text: text.slice(last) });
  }
  return out;
}

/** Walk a block tree, applying `fn` to every inline-content array. */
export function mapBlocks(blocks: Block[], fn: (items: Inline[]) => Inline[]): Block[] {
  return blocks.map((b) => {
    const nb: Block = { ...b };
    if (Array.isArray(b.content)) nb.content = fn(b.content as Inline[]);
    if (Array.isArray(b.children) && b.children.length) nb.children = mapBlocks(b.children, fn);
    return nb;
  });
}

export async function blocksToExtendedMd(editor: MdEditor, blocks: unknown[]): Promise<string> {
  return editor.blocksToMarkdownLossy(mapBlocks(blocks as Block[], encodeInline));
}

export async function extendedMdToBlocks(editor: MdEditor, markdown: string): Promise<unknown[]> {
  const blocks = (await editor.tryParseMarkdownToBlocks(markdown)) as Block[];
  return mapBlocks(blocks, decodeInline);
}
