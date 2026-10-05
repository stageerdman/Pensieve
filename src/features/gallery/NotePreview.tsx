import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "../../components/blocknote-skin.css";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useState } from "react";
import { editorSchema } from "../../components/editorSchema";
import { extendedMdToBlocks } from "../../lib/md/extended";

// A read-only, fully formatted render of a note's Markdown — the same BlockNote engine
// and schema as the writing surface (wrapped in `.pensieve-editor` so it inherits the
// exact editor skin: headings, lists, code, note-links, and images later). One editor
// instance is reused; its blocks are replaced when the previewed note changes, so
// hovering between flasks doesn't churn editor instances.

interface NotePreviewProps {
  markdown: string;
  theme: "light" | "dark";
}

export function NotePreview({ markdown, theme }: NotePreviewProps) {
  const editor = useCreateBlockNote({ schema: editorSchema });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const blocks = await extendedMdToBlocks(editor, markdown);
      if (cancelled) return;
      editor.replaceBlocks(editor.document, (blocks.length ? blocks : []) as never);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, markdown]);

  return (
    <div className="pensieve-editor" aria-hidden={!ready}>
      <BlockNoteView editor={editor} editable={false} theme={theme} formattingToolbar={false} sideMenu={false} />
    </div>
  );
}
