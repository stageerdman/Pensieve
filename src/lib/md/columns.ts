// Columns in the extended-Markdown standard — side-by-side runs of blocks (from Notion's
// column lists; 13 fences in 10 imported notes):
//
//   ```pensieve:columns
//   column 1 markdown…
//   :::column:::
//   column 2 markdown…
//   ```
//
// The editor holds a `columns` block that carries the fence text VERBATIM in its `md` prop
// and renders each column read-only (see components/editor/layout/ColumnsBlock). So a save
// is byte-identical by construction — the editor never re-serializes a column.

export const COLUMNS_FENCE = "pensieve:columns";
export const COLUMN_SEP = "\n:::column:::\n";

interface Block {
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  [k: string]: unknown;
}

/** Fence text → one markdown string per column. */
export function splitColumns(text: string): string[] {
  return text.split(COLUMN_SEP);
}

/** Columns → fence text (inverse of splitColumns). */
export function joinColumns(cols: string[]): string {
  return cols.join(COLUMN_SEP);
}

export const isColumnsBlock = (b: Block): boolean => b?.type === "columns";

/** SAVE: the columns block → its fence, text untouched. */
export function encodeColumnsBlock(b: Block): Block {
  return {
    type: "codeBlock",
    props: { language: COLUMNS_FENCE },
    content: [{ type: "text", text: String(b.props?.md ?? ""), styles: {} }],
  };
}

/** LOAD: a `pensieve:columns` fence → a columns block, or null if it isn't one. */
export function reconstructColumnsFence(b: Block): Block | null {
  const lang = b.type === "codeBlock" && (b.props as { language?: string } | undefined)?.language;
  if (lang !== COLUMNS_FENCE) return null;
  const text = (Array.isArray(b.content) && (b.content[0] as { text?: string })?.text) || "";
  return { type: "columns", props: { md: text } };
}
