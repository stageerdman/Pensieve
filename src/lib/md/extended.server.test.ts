// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { blocksToExtendedMd, extendedMdToBlocks } from "./extended";

// Full round-trip through BlockNote's real converter (server-side editor, same
// API as the browser). This is the guarantee that `.md` stays a faithful,
// idempotent source of truth — the thing INITIAL-BUILD's editor.test.ts protected,
// re-established for the BlockNote editor.

let editor: ServerBlockNoteEditor;
beforeAll(() => {
  editor = ServerBlockNoteEditor.create();
});

const SAMPLE = `# Title

A paragraph with **bold**, *italic*, \`code\`, a [link](https://example.com), and {bg:yellow}a highlight{/}.

## Lists

* bullet one
* bullet two

1. first
2. second

* [ ] todo undone
* [x] todo done

> a blockquote

\`\`\`ts
const x = 1;
\`\`\`
`;

async function roundTrip(md: string) {
  return blocksToExtendedMd(editor, await extendedMdToBlocks(editor, md));
}

describe("BlockNote .md round-trip (extended standard)", () => {
  it("is idempotent for the full v1 block set", async () => {
    const once = await roundTrip(SAMPLE);
    const twice = await roundTrip(once);
    expect(twice).toBe(once);
  });

  it("preserves our colour convention through a round-trip", async () => {
    const out = await roundTrip("some {fg:red}important{/} words\n");
    expect(out).toContain("{fg:red}important{/}");
    const twice = await roundTrip(out);
    expect(twice).toBe(out);
  });

  it("keeps nested lists (3 deep) stable", async () => {
    const md = "* l1\n  * l2\n    * l3\n";
    const once = await roundTrip(md);
    expect(await roundTrip(once)).toBe(once);
  });

  it("preserves a note link {@id|title} through a round-trip", async () => {
    const out = await roundTrip("see {@abc123|My Goals} here\n");
    expect(out).toContain("{@abc123|My Goals}");
    expect(await roundTrip(out)).toBe(out);
  });

  it("round-trips a toggle (summary + body) losslessly as a toggleListItem", async () => {
    const toggle = [
      {
        type: "toggleListItem",
        content: [{ type: "text", text: "My summary", styles: {} }],
        children: [
          { type: "paragraph", content: [{ type: "text", text: "hidden body", styles: {} }] },
          { type: "bulletListItem", content: [{ type: "text", text: "a point", styles: {} }] },
        ],
      },
    ];
    const md = await blocksToExtendedMd(editor, toggle);
    expect(md).toContain("```pensieve:toggle");
    const blocks = (await extendedMdToBlocks(editor, md)) as any[];
    expect(blocks[0].type).toBe("toggleListItem");
    expect(blocks[0].content[0].text).toBe("My summary");
    expect(blocks[0].children.map((c: any) => c.type)).toEqual(["paragraph", "bulletListItem"]);
    expect(blocks[0].children[0].content[0].text).toBe("hidden body");
    // idempotent
    expect(await roundTrip(md)).toBe(md);
  });

  it("preserves inline formatting inside a toggle summary", async () => {
    const toggle = [
      { type: "toggleListItem", content: [
        { type: "text", text: "see ", styles: {} },
        { type: "text", text: "this", styles: { bold: true } },
      ], children: [] },
    ];
    const md = await blocksToExtendedMd(editor, toggle);
    const blocks = (await extendedMdToBlocks(editor, md)) as any[];
    const bold = blocks[0].content.find((c: any) => c.styles?.bold);
    expect(bold?.text).toBe("this");
  });

  it("round-trips a tab-indented (non-list) child via pensieve:children", async () => {
    const nested = [
      { type: "paragraph", content: [{ type: "text", text: "parent", styles: {} }], children: [
        { type: "paragraph", content: [{ type: "text", text: "indented child", styles: {} }] },
      ]},
    ];
    const md = await blocksToExtendedMd(editor, nested);
    expect(md).toContain("```pensieve:children");
    const blocks = (await extendedMdToBlocks(editor, md)) as any[];
    expect(blocks[0].content[0].text).toBe("parent");
    expect(blocks[0].children[0].content[0].text).toBe("indented child");
    expect(await roundTrip(md)).toBe(md);
  });

  it("leaves a plain document untouched (no pensieve fences for standard blocks)", async () => {
    const md = await roundTrip("# T\n\ntext\n\n* a\n  * b\n\n> q\n");
    expect(md).not.toContain("pensieve:");
  });

  it("decodes a colour run into a styled run", async () => {
    const blocks = (await extendedMdToBlocks(editor, "a {bg:red}b{/} c\n")) as any[];
    const run = blocks[0].content.find((c: any) => c.styles?.backgroundColor === "red");
    expect(run?.text).toBe("b");
  });
});
