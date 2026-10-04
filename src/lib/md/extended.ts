// Pensieve extended-Markdown standard.
//
// `.md` on disk is the source of truth. BlockNote's built-in Markdown converter
// handles the standard block set faithfully (verified idempotent — see the P2
// spike), but it has no syntax for inline colours. Rather than lose that info
// (BlockNote's Markdown drops text/background colour), we OWN the standard:
// coloured runs are bridged at the BLOCK level, around BlockNote's converter, so
// the `.md` string stays lossless.
//
// v1 standard — inline colour runs and note links:
//   {fg:red}text{/}            red text
//   {bg:yellow}text{/}         yellow highlight
//   {fg:red bg:yellow}text{/}  both
//   {@noteId|Title}            a link to another note (the "@" menu)
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
interface NoteLinkInline {
  type: "noteLink";
  props?: { noteId?: string; title?: string };
}
type Inline = TextInline | NoteLinkInline | { type: string; [k: string]: unknown };
interface Block {
  content?: unknown;
  children?: Block[];
  [k: string]: unknown;
}

function isText(i: Inline): i is TextInline {
  return i?.type === "text" && typeof (i as TextInline).text === "string";
}

const colorOf = (v?: string) => (v && v !== "default" ? v : null);

/** blocks -> md: note links become {@id|title}; coloured runs become {fg:.. bg:..}…{/}. */
export function encodeInline(items: Inline[]): Inline[] {
  return items.map((it) => {
    if (it?.type === "noteLink") {
      const { noteId = "", title = "" } = (it as NoteLinkInline).props ?? {};
      const safeTitle = String(title).replace(/[{}|]/g, "");
      return { type: "text", text: `{@${noteId}|${safeTitle}}`, styles: {} };
    }
    if (!isText(it) || !it.styles) return it;
    const fg = colorOf(it.styles.textColor);
    const bg = colorOf(it.styles.backgroundColor);
    if (!fg && !bg) return it;
    const { textColor, backgroundColor, ...rest } = it.styles;
    const attrs = [fg && `fg:${fg}`, bg && `bg:${bg}`].filter(Boolean).join(" ");
    return { ...it, text: `{${attrs}}${it.text}{/}`, styles: rest };
  });
}

// Either a colour run ({fg/bg}…{/}) or a note link ({@id|title}).
const TOKEN = /\{((?:fg:[\w-]+)?(?:\s)?(?:bg:[\w-]+)?)\}([\s\S]*?)\{\/\}|\{@([^|{}]*)\|([^{}]*)\}/g;

/** md -> blocks: turn colour runs back into styled text and {@id|title} into note links. */
export function decodeInline(items: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    if (!isText(it) || !/\{(?:fg:|bg:|@)/.test(it.text)) {
      out.push(it);
      continue;
    }
    const text = it.text;
    let last = 0;
    let matched = false;
    for (let m = TOKEN.exec(text); m !== null; m = TOKEN.exec(text)) {
      matched = true;
      if (m.index > last) out.push({ ...it, text: text.slice(last, m.index) });
      if (m[3] !== undefined) {
        out.push({ type: "noteLink", props: { noteId: m[3], title: m[4] ?? "" } });
      } else {
        const styles = { ...(it.styles ?? {}) };
        const fg = m[1].match(/fg:([\w-]+)/);
        const bg = m[1].match(/bg:([\w-]+)/);
        if (fg) styles.textColor = fg[1];
        if (bg) styles.backgroundColor = bg[1];
        out.push({ ...it, text: m[2], styles });
      }
      last = m.index + m[0].length;
    }
    TOKEN.lastIndex = 0;
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

// ── Block-structure bridge ──────────────────────────────────────────────────
// BlockNote's Markdown is lossy for two things standard Markdown can't express:
//   • toggle list items  → it downgrades them to plain bullets, losing the toggle;
//   • non-list nesting    → children of a paragraph/heading/quote/toggle are flattened.
// We OWN the standard here too: such blocks are bridged into fenced `pensieve:*`
// code blocks (which round-trip verbatim), then rebuilt on parse. Everything the
// converter already handles losslessly (flat blocks, nested LISTS, quotes) is left
// untouched, so the common case stays plain, portable Markdown.
//
//   ```pensieve:toggle          a toggle: first line = summary, rest = its body
//   Summary text
//   body markdown…
//   ```
//   ```pensieve:children        the indented children of the block just above
//   child markdown…
//   ```
// Known limitation: a fenced code block nested *inside* a toggle/indent body would
// collide with the outer fence; rare, and noted in issues.

const LIST_TYPES = new Set(["bulletListItem", "numberedListItem", "checkListItem"]);

// Empty paragraphs (blank lines the user adds for spacing) are dropped by Markdown —
// consecutive blank lines collapse. We keep them by filling an empty paragraph with a
// zero-width space, which survives the round-trip yet stays invisible in the .md.
const ZWSP = "​";
const ZWSP_RE = /​/g;

function isBlankParagraph(b: Block): boolean {
  if (b.type !== "paragraph") return false;
  const c = b.content;
  if (!Array.isArray(c) || c.length === 0) return true;
  return (c as Inline[]).every((i) => isText(i) && i.text.replace(ZWSP_RE, "").trim() === "");
}

function blankParagraph(): Block {
  return { type: "paragraph", content: [{ type: "text", text: ZWSP, styles: {} }] };
}

function fence(language: string, text: string): Block {
  return {
    type: "codeBlock",
    props: { language },
    content: [{ type: "text", text, styles: {} }],
  };
}

const textOf = (b: Block): string =>
  (Array.isArray(b.content) && (b.content[0] as TextInline)?.text) || "";
const langOf = (b: Block): string =>
  (b.type === "codeBlock" && (b.props as { language?: string } | undefined)?.language) || "";

/** Serialize a block's inline content to Markdown (bold/links/our sentinels), no
 *  trailing newline — used for a toggle's one-line summary. */
async function inlineToMd(editor: MdEditor, content: unknown): Promise<string> {
  const items = encodeInline((Array.isArray(content) ? content : []) as Inline[]);
  const md = await editor.blocksToMarkdownLossy([{ type: "paragraph", content: items }]);
  return md.replace(/\n+$/, "");
}

/** Replace toggles / non-list nesting with `pensieve:*` fences the converter keeps. */
async function encodeStructure(editor: MdEditor, blocks: Block[]): Promise<Block[]> {
  const out: Block[] = [];
  for (const b of blocks) {
    const children = (Array.isArray(b.children) ? b.children : []) as Block[];
    const isList = LIST_TYPES.has(b.type as string);
    const allListChildren = children.length > 0 && children.every((c) => LIST_TYPES.has(c.type as string));

    if (b.type === "toggleListItem") {
      const summary = await inlineToMd(editor, b.content);
      const body = children.length ? (await blocksToExtendedMd(editor, children)).replace(/\n+$/, "") : "";
      out.push(fence("pensieve:toggle", body ? `${summary}\n${body}` : summary));
    } else if (children.length && !(isList && allListChildren)) {
      out.push({ ...b, children: undefined });
      const body = (await blocksToExtendedMd(editor, children)).replace(/\n+$/, "");
      out.push(fence("pensieve:children", body));
    } else if (children.length) {
      out.push({ ...b, children: await encodeStructure(editor, children) });
    } else if (isBlankParagraph(b)) {
      out.push(blankParagraph()); // keep the blank line (ZWSP survives Markdown)
    } else {
      out.push(b);
    }
  }
  return out;
}

/** Inverse of encodeStructure: rebuild toggles and attach `pensieve:children`. */
async function reconstructStructure(editor: MdEditor, blocks: Block[]): Promise<Block[]> {
  const out: Block[] = [];
  for (const b of blocks) {
    const lang = langOf(b);
    if (lang === "pensieve:toggle") {
      const text = textOf(b);
      const nl = text.indexOf("\n");
      const summary = nl === -1 ? text : text.slice(0, nl);
      const body = nl === -1 ? "" : text.slice(nl + 1);
      const parsedSummary = summary ? ((await editor.tryParseMarkdownToBlocks(summary)) as Block[]) : [];
      const content = (parsedSummary[0]?.content as Inline[]) ?? [];
      const children = body
        ? await reconstructStructure(editor, (await editor.tryParseMarkdownToBlocks(body)) as Block[])
        : [];
      out.push({ type: "toggleListItem", props: {}, content, children });
    } else if (lang === "pensieve:children") {
      const kids = await reconstructStructure(editor, (await editor.tryParseMarkdownToBlocks(textOf(b))) as Block[]);
      const prev = out[out.length - 1];
      if (prev) prev.children = [ ...((prev.children as Block[]) ?? []), ...kids ];
    } else {
      const nb: Block = { ...b };
      if (b.type === "paragraph" && textOf(b).replace(ZWSP_RE, "") === "") {
        nb.content = []; // a ZWSP placeholder → restore the genuinely empty paragraph
      } else if (Array.isArray(b.children) && b.children.length) {
        nb.children = await reconstructStructure(editor, b.children as Block[]);
      }
      out.push(nb);
    }
  }
  return out;
}

export async function blocksToExtendedMd(editor: MdEditor, blocks: unknown[]): Promise<string> {
  const structural = await encodeStructure(editor, blocks as Block[]);
  return editor.blocksToMarkdownLossy(mapBlocks(structural, encodeInline));
}

export async function extendedMdToBlocks(editor: MdEditor, markdown: string): Promise<unknown[]> {
  const raw = (await editor.tryParseMarkdownToBlocks(markdown)) as Block[];
  const rebuilt = await reconstructStructure(editor, raw);
  return mapBlocks(rebuilt, decodeInline);
}
