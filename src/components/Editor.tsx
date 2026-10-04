import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "./blocknote-skin.css";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useRef } from "react";
import { blocksToExtendedMd, extendedMdToBlocks } from "../lib/md/extended";

// The writing surface — a Notion-like BLOCK editor (BlockNote). Blocks are
// draggable, "/" opens the slash menu, and a selection bubble covers inline
// styling, all out of the box. Content is Markdown in, Markdown out through our
// extended standard (lib/md/extended) — the `.md` file stays the source of truth.
//
// The parent remounts this per note (key={note.id}), so markdown is loaded once
// on mount and we never fight an incoming prop mid-edit.

interface EditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
  focusMode: boolean;
  theme: "light" | "dark";
}

export function Editor({ markdown, onChange, focusMode, theme }: EditorProps) {
  const editor = useCreateBlockNote();
  const loading = useRef(true);

  // Load the note's .md into blocks once, on mount. `loading` suppresses the
  // onChange that the programmatic replace would otherwise fire (no false dirty).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const blocks = await extendedMdToBlocks(editor, markdown);
      if (cancelled) return;
      if (blocks.length) editor.replaceBlocks(editor.document, blocks as never);
      loading.current = false;
      try {
        editor.focus();
      } catch {
        /* focus is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = async () => {
    if (loading.current) return;
    onChange(await blocksToExtendedMd(editor, editor.document));
  };

  return (
    <div className={"pensieve-editor" + (focusMode ? " focus-typewriter" : "")}>
      <BlockNoteView editor={editor} theme={theme} onChange={handleChange} />
    </div>
  );
}
