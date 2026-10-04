// Pensieve extended-Markdown standard.
//
// `.md` on disk is the source of truth. BlockNote's built-in Markdown converter
// handles the standard block set faithfully (verified idempotent — see the P2
// spike), but it has no syntax for things like highlights. Rather than lose that
// info, we OWN the standard: conventions Markdown can't express are bridged at the
// BLOCK level, around BlockNote's converter, so the `.md` string stays lossless.
//
// v0 standard:
//   ==text==  <->  inline text with a red highlight (BlockNote `backgroundColor`)
// Add future conventions (callouts, colours, …) by extending encode/decode here.

/** The two BlockNote converter methods we depend on (client editor or server-util).
 *  The client editor returns these synchronously; server-util returns Promises —
 *  we accept either and `await` at the call sites. */
export interface MdEditor {
  blocksToMarkdownLossy(blocks?: unknown[]): string | Promise<string>;
  tryParseMarkdownToBlocks(markdown: string): unknown[] | Promise<unknown[]>;
}

/** Our highlight colour token, as stored in a BlockNote style. */
export const HIGHLIGHT = "red";

// Minimal shapes we touch. BlockNote's real types are richer; we only read/write
// these fields and pass everything else through untouched.
interface TextInline {
  type: "text";
  text: string;
  styles?: Record<string, unknown> & { backgroundColor?: string };
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

/** blocks -> md: replace highlighted runs with `==...==` plain text. */
export function encodeInline(items: Inline[]): Inline[] {
  return items.map((it) => {
    if (isText(it) && it.styles?.backgroundColor === HIGHLIGHT) {
      const { backgroundColor, ...rest } = it.styles;
      return { ...it, text: `==${it.text}==`, styles: rest };
    }
    return it;
  });
}

/** md -> blocks: turn `==...==` runs back into highlighted text. */
export function decodeInline(items: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    if (isText(it) && it.text.includes("==")) {
      for (const part of it.text.split(/(==[^=]+==)/g)) {
        if (!part) continue;
        const m = part.match(/^==([^=]+)==$/);
        out.push(
          m
            ? { ...it, text: m[1], styles: { ...(it.styles ?? {}), backgroundColor: HIGHLIGHT } }
            : { ...it, text: part },
        );
      }
    } else {
      out.push(it);
    }
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
