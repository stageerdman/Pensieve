// Our extended-Markdown standard layer (spike).
//
// The idea we're testing: BlockNote's built-in Markdown is "lossy" only because
// its converter has no syntax for things like highlights. If WE own the standard
// and bridge it at the *block* level (where the styling info still exists), the
// `.md` string can stay the lossless source of truth.
//
// v0 standard: ==text==  <->  inline text with a red highlight
// (BlockNote style `backgroundColor: "red"`). Add more conventions the same way.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Inline = any;
type Block = any;

const HL = "red"; // our highlight color token

// blocks -> md: replace highlighted text items with ==...== plain text.
function encodeInline(items: Inline[]): Inline[] {
  return items.map((it) => {
    if (it?.type === "text" && it.styles?.backgroundColor === HL) {
      const { backgroundColor, ...rest } = it.styles;
      return { ...it, text: `==${it.text}==`, styles: rest };
    }
    return it;
  });
}

// md -> blocks: turn ==...== runs back into highlighted text items.
function decodeInline(items: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    if (it?.type === "text" && typeof it.text === "string" && it.text.includes("==")) {
      for (const part of it.text.split(/(==[^=]+==)/g)) {
        if (!part) continue;
        const m = part.match(/^==([^=]+)==$/);
        out.push(
          m
            ? { ...it, text: m[1], styles: { ...(it.styles ?? {}), backgroundColor: HL } }
            : { ...it, text: part }
        );
      }
    } else {
      out.push(it);
    }
  }
  return out;
}

function mapBlocks(blocks: Block[], fn: (items: Inline[]) => Inline[]): Block[] {
  return blocks.map((b) => {
    const nb: Block = { ...b };
    if (Array.isArray(b.content)) nb.content = fn(b.content);
    if (Array.isArray(b.children) && b.children.length) nb.children = mapBlocks(b.children, fn);
    return nb;
  });
}

export async function blocksToExtendedMd(editor: any, blocks: Block[]): Promise<string> {
  return editor.blocksToMarkdownLossy(mapBlocks(blocks, encodeInline));
}

export async function extendedMdToBlocks(editor: any, md: string): Promise<Block[]> {
  const blocks = await editor.tryParseMarkdownToBlocks(md);
  return mapBlocks(blocks, decodeInline);
}
