import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { blocksToExtendedMd, extendedMdToBlocks } from "./extended";

// Throwaway spike. Tests the "own-the-Markdown-standard" principle against
// BlockNote: editor autoconverts to our .md on every change, autoloads from .md,
// and we check whether the round-trip is idempotent. Drag handle + slash ("/")
// menu are BlockNote defaults — try them live in the editor on the left.

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

const KEY = "pensieve.spike.md";

export function App() {
  const editor = useCreateBlockNote();
  const [md, setMd] = useState("");
  const [draft, setDraft] = useState("");
  const [rt, setRt] = useState<{ ok: boolean; detail: string } | null>(null);
  const loading = useRef(false);

  const sync = useCallback(async () => {
    if (loading.current) return;
    const text = await blocksToExtendedMd(editor, editor.document);
    setMd(text);
    setDraft(text);
    localStorage.setItem(KEY, text);
  }, [editor]);

  const loadFromMd = useCallback(
    async (text: string) => {
      loading.current = true;
      const blocks = await extendedMdToBlocks(editor, text);
      editor.replaceBlocks(editor.document, blocks);
      loading.current = false;
      await sync();
    },
    [editor, sync]
  );

  useEffect(() => {
    void loadFromMd(localStorage.getItem(KEY) ?? SAMPLE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkRoundTrip = useCallback(async () => {
    const a = await blocksToExtendedMd(editor, editor.document);
    const blocks = await extendedMdToBlocks(editor, a);
    const b = await blocksToExtendedMd(editor, blocks);
    if (a === b) {
      setRt({ ok: true, detail: `idempotent — stable at ${a.length} chars` });
      return;
    }
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const win = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 24), i + 24));
    setRt({
      ok: false,
      detail: `drift at char ${i}\n md1 …${win(a)}\n md2 …${win(b)}`,
    });
  }, [editor]);

  const box: React.CSSProperties = {
    font: "12px ui-monospace, Menlo, monospace",
    whiteSpace: "pre-wrap",
    border: "1px solid #ddd",
    borderRadius: 6,
    padding: 10,
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", height: "100vh", font: "14px system-ui" }}>
      <div style={{ overflow: "auto", borderRight: "1px solid #eee" }}>
        <div style={{ padding: "8px 16px", color: "#666", fontSize: 12 }}>
          Editor — hover a block for the <b>drag handle</b>, type <b>/</b> for the slash menu,
          select text then set its highlight to <b>red</b> to test <code>==…==</code>.
        </div>
        <BlockNoteView editor={editor} onChange={sync} />
      </div>

      <div style={{ overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={checkRoundTrip}>Check round-trip (md→blocks→md)</button>
          <button onClick={() => loadFromMd(draft)}>Apply edited .md → editor</button>
          <button onClick={() => loadFromMd(SAMPLE)}>Reset to sample</button>
        </div>

        {rt && (
          <div style={{ ...box, borderColor: rt.ok ? "#1a7f37" : "#cf222e", color: rt.ok ? "#1a7f37" : "#cf222e" }}>
            {rt.ok ? "✓ " : "✗ "}
            {rt.detail}
          </div>
        )}

        <div style={{ color: "#666", fontSize: 12 }}>
          live .md (the source of truth — editable, then “Apply”):
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          style={{ ...box, height: 300, resize: "vertical" }}
        />

        <div style={{ color: "#666", fontSize: 12 }}>last autosaved .md:</div>
        <div style={box}>{md}</div>
      </div>
    </div>
  );
}
