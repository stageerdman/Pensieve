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

A paragraph with **bold**, *italic*, \`code\`, a [link](https://example.com), and ==a highlight==.

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

  it("preserves our ==highlight== convention through a round-trip", async () => {
    const out = await roundTrip("some ==important== words\n");
    expect(out).toContain("==important==");
    const twice = await roundTrip(out);
    expect(twice).toBe(out);
  });

  it("keeps nested lists (3 deep) stable", async () => {
    const md = "* l1\n  * l2\n    * l3\n";
    const once = await roundTrip(md);
    expect(await roundTrip(once)).toBe(once);
  });

  it("decodes a highlight into a styled run", async () => {
    const blocks = (await extendedMdToBlocks(editor, "a ==b== c\n")) as any[];
    const run = blocks[0].content.find((c: any) => c.styles?.backgroundColor === "red");
    expect(run?.text).toBe("b");
  });
});
