import { ServerBlockNoteEditor } from "@blocknote/server-util";
const editor = ServerBlockNoteEditor.create();
const cases = {
  "nested bullets": "- a\n  - a1\n  - a2\n- b\n",
  "bare url": "See https://example.com now\n",
  "md link": "A [link](https://example.com) here\n",
  "deep nest": "- l1\n  - l2\n    - l3\n",
  "bold-in-list": "- **bold** item\n- plain\n",
};
for (const [name, md] of Object.entries(cases)) {
  const b1 = await editor.tryParseMarkdownToBlocks(md);
  const m1 = await editor.blocksToMarkdownLossy(b1);
  const m2 = await editor.blocksToMarkdownLossy(await editor.tryParseMarkdownToBlocks(m1));
  console.log(`\n### ${name}`);
  console.log("in :", JSON.stringify(md));
  console.log("out:", JSON.stringify(m1));
  console.log("idempotent:", m1 === m2);
}
