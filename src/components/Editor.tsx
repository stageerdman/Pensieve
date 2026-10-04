import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "./blocknote-skin.css";
import { BlockNoteView } from "@blocknote/mantine";
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  BlockTypeSelect,
  BasicTextStyleButton,
  ColorStyleButton,
  CreateLinkButton,
} from "@blocknote/react";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEffect, useRef } from "react";
import { blocksToExtendedMd, extendedMdToBlocks } from "../lib/md/extended";

// Two-level ⌘A: the first press selects the current block's text; the next selects
// the whole document. We handle both levels explicitly (rather than defer to the
// default) so the behaviour is deterministic. Always returns true so the caller
// prevents the native select-all. Level 1 applies only when the cursor sits inside
// a non-empty text block and that block isn't already fully selected; otherwise
// (empty block, already whole-block, or a selection spanning blocks) → whole doc.
function selectBlockThenAll(view: EditorView): void {
  const { state } = view;
  const sel = state.selection;
  const $from = sel.$from;
  const start = $from.start();
  const end = $from.end();
  const inTextBlock = $from.parent.isTextblock && $from.parent.content.size > 0;
  const withinBlock = sel.from >= start && sel.to <= end;
  const isWholeBlock = sel.from === start && sel.to === end;

  const selection =
    inTextBlock && withinBlock && !isWholeBlock
      ? TextSelection.create(state.doc, start, end) // level 1: this block
      : new AllSelection(state.doc); // level 2: whole document
  view.dispatch(state.tr.setSelection(selection));
}

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
  const wrapRef = useRef<HTMLDivElement>(null);

  // Two-level ⌘A. Attached to the wrapper (capture phase) so we read the live
  // ProseMirror view at event time — it is reliably mounted by then.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "a") {
        const view = editor.prosemirrorView;
        if (view) {
          selectBlockThenAll(view);
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    el.addEventListener("keydown", onKey, true);
    return () => el.removeEventListener("keydown", onKey, true);
  }, [editor]);

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
    <div ref={wrapRef} className={"pensieve-editor" + (focusMode ? " focus-typewriter" : "")}>
      {/* Custom formatting toolbar: only styles our Markdown can represent, so the
          .md stays lossless. Text/highlight colour IS included — our extended
          standard (lib/md/extended) round-trips colours losslessly. Underline is
          omitted (no Markdown equivalent). */}
      <BlockNoteView editor={editor} theme={theme} onChange={handleChange} formattingToolbar={false}>
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              <BlockTypeSelect key="blockType" />
              <BasicTextStyleButton basicTextStyle="bold" key="bold" />
              <BasicTextStyleButton basicTextStyle="italic" key="italic" />
              <BasicTextStyleButton basicTextStyle="strike" key="strike" />
              <BasicTextStyleButton basicTextStyle="code" key="code" />
              <ColorStyleButton key="color" />
              <CreateLinkButton key="link" />
            </FormattingToolbar>
          )}
        />
      </BlockNoteView>
    </div>
  );
}
