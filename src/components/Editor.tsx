import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import { useEffect } from "react";
import { editorExtensions } from "../lib/editor";

// The writing surface. Markdown-as-you-type (StarterKit input rules) is the
// primary path; a selection bubble covers select-then-style. No standing toolbar
// (design.md). Content is Markdown in, Markdown out — the .md file is the truth.

interface EditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
  focusMode: boolean;
}

export function Editor({ markdown, onChange, focusMode }: EditorProps) {
  const editor = useEditor({
    extensions: editorExtensions(),
    content: markdown,
    autofocus: "end",
    editorProps: {
      attributes: {
        class:
          "prose-editor outline-none min-h-[60vh] " +
          (focusMode ? "focus-typewriter" : ""),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown() as string);
    },
  });

  // Keep the paragraph-dimming class in sync with focus mode without remounting.
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom as HTMLElement;
    el.classList.toggle("focus-typewriter", focusMode);
  }, [editor, focusMode]);

  if (!editor) return null;

  const btn =
    "px-2 py-1 text-sm rounded hover:bg-surface text-text-muted hover:text-text";

  return (
    <>
      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 120 }}
        className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-raised px-1 py-0.5 shadow-lg"
      >
        <button
          className={btn}
          aria-label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </button>
        <button
          className={btn}
          aria-label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>i</em>
        </button>
        <button
          className={btn}
          aria-label="Inline code"
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          {"</>"}
        </button>
        <button
          className={btn}
          aria-label="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </button>
      </BubbleMenu>
      <EditorContent editor={editor} />
    </>
  );
}
