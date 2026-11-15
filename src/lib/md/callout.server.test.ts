// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { blocksToExtendedMd, extendedMdToBlocks } from "./extended";

// Callouts + columns through BlockNote's real converter (server-side editor). The callout
// fence body is the editor's own markdown, so an unchanged callout must save back
// BYTE-IDENTICAL — the Notion import (593 callouts) depends on it.

let editor: ServerBlockNoteEditor;
beforeAll(() => {
  editor = ServerBlockNoteEditor.create();
});

const ZW = "​";
const roundTrip = async (md: string) => blocksToExtendedMd(editor, await extendedMdToBlocks(editor, md));

type B = { type: string; props?: Record<string, unknown>; content?: unknown; children?: B[] };
const text = (t: string, styles: Record<string, unknown> = {}) => ({ type: "text", text: t, styles });
const para = (...content: unknown[]): B => ({ type: "paragraph", content });

/** Build a callout the way the importer does: the body is serialized with the app's own
 *  serializer, then wrapped in the fence. */
async function calloutMd(body: B[], icon = ""): Promise<string> {
  const md = (await blocksToExtendedMd(editor, body)).replace(/\n+$/, "");
  return "```pensieve:callout\n" + (icon ? `icon=${icon}\n` : "") + md + "\n```\n";
}

describe("pensieve:callout ⇄ callout block", () => {
  it("loads as a callout: first paragraph = its line, the rest = its children", async () => {
    const md = await calloutMd([para(text("The answer")), para(text("More detail"))], "🚨");
    const blocks = (await extendedMdToBlocks(editor, md)) as B[];
    expect(blocks).toHaveLength(1);
    const c = blocks[0];
    expect(c.type).toBe("callout");
    expect(c.props).toEqual({ icon: "🚨" });
    expect((c.content as { text: string }[])[0].text).toBe("The answer");
    expect(c.children?.map((k) => k.type)).toEqual(["paragraph"]);
  });

  const cases: [string, () => Promise<string>][] = [
    ["no icon, one line", () => calloutMd([para(text("Just a line"))])],
    ["icon", () => calloutMd([para(text("Careful here"))], "🚨")],
    ["any emoji", () => calloutMd([para(text("An idea"))], "💡")],
    [
      "multi-paragraph + bold",
      () => calloutMd([para(text("To: someone")), para(text("Subject", { bold: true }), text(": hello")), para(text("Body text."))]),
    ],
    [
      "lists (nested)",
      () =>
        calloutMd([
          para(text("How:")),
          { type: "bulletListItem", content: [text("one")], children: [{ type: "bulletListItem", content: [text("deeper")] }] },
          { type: "bulletListItem", content: [text("two")] },
          { type: "numberedListItem", content: [text("first")] },
          { type: "numberedListItem", content: [text("second")] },
          { type: "checkListItem", props: { checked: true }, content: [text("done")] },
        ]),
    ],
    [
      "note links + link + colour",
      () =>
        calloutMd([
          para(
            text("See "),
            { type: "noteLink", props: { noteId: "abc123", title: "Other note" } },
            text(" and "),
            { type: "link", href: "https://example.com", content: [text("this")] },
            text(" "),
            text("red", { textColor: "red" }),
          ),
        ]),
    ],
    ["blank lines inside", () => calloutMd([para(text("Top")), para(), para(), para(text("Bottom"))])],
    ["empty first line (Notion callout with only children)", () => calloutMd([para(), para(text("child text")), para(text("more"))])],
  ];

  for (const [name, make] of cases) {
    it(`unchanged callout saves byte-identical — ${name}`, async () => {
      const md = await make();
      expect(md).toContain("```pensieve:callout");
      expect(await roundTrip(md)).toBe(md);
    });
  }

  it("keeps the callout's surroundings intact", async () => {
    const c = await calloutMd([para(text("Purpose: to learn"))]);
    const md = `# Daily\n\n**What purpose fulfils me today?**\n\n${c}\nAfter the box.\n`;
    expect(await roundTrip(md)).toBe(md);
  });

  it("an edit to the callout's line is saved inside the fence", async () => {
    const md = await calloutMd([para(text("Old")), para(text("kept"))], "🚨");
    const blocks = (await extendedMdToBlocks(editor, md)) as B[];
    blocks[0].content = [text("New")];
    expect(await blocksToExtendedMd(editor, blocks)).toBe("```pensieve:callout\nicon=🚨\nNew\n\nkept\n```\n");
  });

  it("a fresh empty callout (/callout) is stable", async () => {
    const once = await blocksToExtendedMd(editor, [{ type: "callout", props: { icon: "" }, content: [] }]);
    expect(once).toBe("```pensieve:callout\n" + ZW + "\n```\n");
    expect(await roundTrip(once)).toBe(once);
    const blocks = (await extendedMdToBlocks(editor, once)) as B[];
    expect(blocks[0]).toMatchObject({ type: "callout", content: [], children: [] });
  });

  // BlockNote's own markdown isn't a fixed point on first serialize for trailing spaces and
  // hard breaks (the importer's "loop load→save until stable" lesson) — a body like that
  // settles after ONE save and is byte-identical from then on.
  it("a non-canonical body settles after one save", async () => {
    for (const md of [
      "```pensieve:callout\nicon=🚨\nWatch out \n\n* a \n* b\n```\n",
      await calloutMd([para(text("line one\nline two"))]),
    ]) {
      const once = await roundTrip(md);
      expect(await roundTrip(once)).toBe(once);
    }
  });
});

describe("pensieve:columns ⇄ columns block", () => {
  it("keeps the fence text verbatim", async () => {
    const md =
      "Before\n\n```pensieve:columns\n**Left**\n\n* a\n* b\n:::column:::\n![](media/n1/x.png)\n:::column:::\n" + ZW + "\n```\n\nAfter\n";
    const blocks = (await extendedMdToBlocks(editor, md)) as B[];
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "columns", "paragraph"]);
    expect(await roundTrip(md)).toBe(md);
  });
});
