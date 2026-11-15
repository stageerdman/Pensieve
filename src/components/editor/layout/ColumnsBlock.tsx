import { useEffect, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { extendedMdToBlocks, type MdEditor } from "../../../lib/md/extended";
import { splitColumns } from "../../../lib/md/columns";
import { log } from "../../../lib/logger";

// Columns (`columns` block ⇄ ```pensieve:columns fence, lib/md/columns) — side by side,
// wrapping to a stack when the text column is narrow. READ-ONLY by design: only 10 imported
// notes have them, and a truly editable multi-column layout isn't something BlockNote 0.55
// offers without its separately-licensed xl-multi-column package. The block keeps the fence
// text verbatim in `md`, so a save can never alter a column. Each column is rendered through
// the editor's own converter (extended md → blocks → static HTML): images, lists, bold and
// note links look like the rest of the note.

interface HtmlEditor extends MdEditor {
  blocksToHTMLLossy(blocks?: unknown[]): string;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ColumnsView({ md, editor }: { md: string; editor: HtmlEditor }) {
  const [cols, setCols] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const out: string[] = [];
        for (const col of splitColumns(md)) {
          const blocks = await extendedMdToBlocks(editor, col);
          out.push(editor.blocksToHTMLLossy(blocks));
        }
        if (!cancelled) setCols(out);
      } catch (err) {
        log.warn("editor", "columns.render.fail", { err: String(err) });
        // Fall back to the raw text (escaped, line breaks kept) — still readable.
        if (!cancelled) setCols(splitColumns(md).map((c) => `<p class="pensieve-columns-raw">${escapeHtml(c)}</p>`));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [md, editor]);

  const shown = cols ?? splitColumns(md).map(() => "");
  return (
    <div className="pensieve-columns" contentEditable={false}>
      {shown.map((html, i) => (
        // The HTML is BlockNote's own serializer output for this note's markdown (text is
        // escaped by it) — the same trust level as the note itself.
        <div key={i} className="pensieve-columns-col" dangerouslySetInnerHTML={{ __html: html }} />
      ))}
    </div>
  );
}

export const ColumnsBlock = createReactBlockSpec(
  {
    type: "columns",
    content: "none",
    propSchema: {
      // The fence text, verbatim (columns joined by `\n:::column:::\n`).
      md: { default: "" },
    },
  },
  {
    render: ({ block, editor }) => (
      <ColumnsView md={(block.props as { md: string }).md} editor={editor as unknown as HtmlEditor} />
    ),
  },
)();
