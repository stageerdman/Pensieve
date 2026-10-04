// Headless verification of the "own-the-.md-standard" principle against BlockNote,
// using the official ServerBlockNoteEditor (same converter API as the browser).
// Answers: (1) is md->blocks->md idempotent? (2) what does the built-in converter
// drop? (3) does our ==highlight== bridge survive a round-trip?

import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { blocksToExtendedMd, extendedMdToBlocks } from "./src/extended.ts";

const editor = ServerBlockNoteEditor.create();

const SAMPLE = `# Pensieve spike

A paragraph with **bold**, *italic*, \`code\`, a [link](https://example.com), and ==a highlight==.

## Lists
- bullet one
- bullet two

1. first
2. second

- [ ] todo undone
- [x] todo done

> a blockquote

\`\`\`ts
const x = 1;
\`\`\`
`;

function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return null;
  const w = (s) => JSON.stringify(s.slice(Math.max(0, i - 30), i + 30));
  return `@${i}\n   md1 …${w(a)}\n   md2 …${w(b)}`;
}

console.log("=== 1) BlockNote BUILT-IN converter (no bridge) ===");
{
  const blocks1 = await editor.tryParseMarkdownToBlocks(SAMPLE);
  const md1 = await editor.blocksToMarkdownLossy(blocks1);
  const blocks2 = await editor.tryParseMarkdownToBlocks(md1);
  const md2 = await editor.blocksToMarkdownLossy(blocks2);
  console.log("input .md:\n" + SAMPLE);
  console.log("--- after one round-trip (md1) ---\n" + md1);
  console.log("input === md1 ? ", SAMPLE.trim() === md1.trim());
  console.log("md1  === md2  ? (idempotent once stabilised)", md1 === md2, firstDiff(md1, md2) ?? "");
}

console.log("\n=== 2) OUR bridge (==highlight== <-> red highlight) ===");
{
  const blocks = await extendedMdToBlocks(editor, SAMPLE);
  // did the highlight decode into a styled text run?
  const para = blocks.find((b) => Array.isArray(b.content) && b.content.some((c) => c.styles?.backgroundColor === "red"));
  console.log("highlight decoded to styled run? ", Boolean(para));
  const md1 = await blocksToExtendedMd(editor, blocks);
  const md2 = await blocksToExtendedMd(editor, await extendedMdToBlocks(editor, md1));
  console.log("bridge round-trip idempotent? ", md1 === md2, firstDiff(md1, md2) ?? "");
  console.log("==highlight== preserved in output? ", md1.includes("==a highlight=="));
}
