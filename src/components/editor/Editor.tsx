import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "./blocknote-skin.css";
import { BlockNoteView } from "@blocknote/mantine";
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  BlockTypeSelect,
  BasicTextStyleButton,
  ColorStyleButton,
  CreateLinkButton,
} from "@blocknote/react";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEffect, useRef } from "react";
import { blocksToExtendedMd, extendedMdToBlocks } from "../../lib/md/extended";
import { setNoteLinkOpen, setNoteLinkResolve } from "./noteLink";
import { editorSchema } from "./editorSchema";
import { BlockSelectionDecorations } from "./blockSelectionDecorations";
import { ImagePasteDrop, setImageDropHandlers } from "./media/imagePasteDrop";
import { setMediaNoteId } from "./media/mediaContext";
import { makeUploadFile } from "./media/insertImage";
import { insertImagesSmart, type GroupEditor } from "./media/insertGroup";
import { mediaToast } from "./media/mediaToast";
import { Image as ImageIcon, Images as ImagesIcon } from "../icons";
import { GutterHandle } from "./GutterHandle";
import { useBlockMarquee } from "./useBlockMarquee";
import { useBlockDrag } from "./useBlockDrag";
import { FlaskFor } from "../Flask";
import type { NoteMeta } from "../../lib/types";

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

// The minimal slice of the BlockNote editor the content loader needs. Kept as a
// named interface so loadBlocksWithoutHistory can be unit-tested against a real
// editor without dragging in the full generic BlockNote type.
interface LoadableEditor {
  document: unknown;
  transact: (cb: (tr: { setMeta: (k: string, v: unknown) => void }) => void) => void;
  replaceBlocks: (toRemove: unknown, toInsert: unknown) => void;
}

// Load the note's blocks as a NON-undoable change. Without the addToHistory=false
// meta, the mount-time replaceBlocks is a normal undo step on top of the empty
// baseline, so a single ⌘Z reverts the whole load → the editor goes blank →
// onChange auto-saves that empty markdown over the .md file, wiping the note with
// no recovery (the exact bug this guards against). Marking the load transaction
// addToHistory=false keeps it out of the undo stack: ⌘Z still undoes the user's
// OWN edits, it just can't go back past the loaded content. BlockNote's transact
// is re-entrant, so replaceBlocks' own transaction reuses this one and inherits
// the meta.
export function loadBlocksWithoutHistory(editor: LoadableEditor, blocks: unknown[]): void {
  if (!blocks.length) return;
  editor.transact((tr) => {
    tr.setMeta("addToHistory", false);
    editor.replaceBlocks(editor.document, blocks);
  });
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
  selfId: string; // the current note — excluded from the "@" menu (no self-links)
  notes: NoteMeta[]; // for the "@" note-link menu
  onOpenNote: (id: string) => void; // clicking a note link opens it
}

export function Editor({ markdown, onChange, focusMode, theme, selfId, notes, onOpenNote }: EditorProps) {
  // `_tiptapOptions.extensions` is BlockNote's escape hatch to add raw TipTap/ProseMirror
  // extensions — here, the multi-row block-selection highlight (blockSelectionDecorations).
  const editor = useCreateBlockNote({
    schema: editorSchema,
    // Every image insert path (uploadFile, /image, paste, drop) funnels through the
    // Phase-0 save flow; uploadFile is BlockNote's own funnel for file selection.
    uploadFile: makeUploadFile(() => selfId),
    _tiptapOptions: { extensions: [BlockSelectionDecorations, ImagePasteDrop] },
  });
  const loading = useRef(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  // Notion-style marquee: drag in the blank margin to select multiple rows, then move
  // them together with the drag handle (useBlockMarquee sets the selection; BlockNote's
  // handle does the move).
  useBlockMarquee(editor, wrapRef);
  // Pointer-based block drag (BlockNote's HTML5 drag can't drop in the WKWebView shell).
  // Cast: the hook needs only a small slice of the editor; BlockNote's full generic type
  // over-constrains insertBlocks' argument, so we adapt to the hook's minimal interface.
  const startBlockDrag = useBlockDrag(editor as unknown as Parameters<typeof useBlockDrag>[0], wrapRef);

  // The image block + paste/drop plugin live outside React; give them the current note
  // id (for the media path) and the save+insert flow. insertImagesSmart decides whether
  // the incoming images form a gallery (2+ in one gesture / adjacency / drop-onto) or stay
  // a single image (Phase 3); a non-image drop is rejected with one whisper.
  useEffect(() => setMediaNoteId(selfId), [selfId]);
  useEffect(() => {
    setImageDropHandlers(
      (files, atBlockId) => {
        void insertImagesSmart(editor as unknown as GroupEditor, selfId, files, atBlockId);
      },
      (reason) => mediaToast(reason),
    );
    return () => setImageDropHandlers(null, null);
  }, [editor, selfId]);

  // Wire note-link clicks to open the note (the inline spec's render is module-level).
  useEffect(() => setNoteLinkOpen(onOpenNote), [onOpenNote]);
  // Let note links resolve the referenced note's live flask (icon + fill).
  useEffect(() => setNoteLinkResolve((id) => notesRef.current.find((n) => n.id === id)), []);

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
      loadBlocksWithoutHistory(editor as unknown as LoadableEditor, blocks);
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
      <BlockNoteView
        editor={editor}
        theme={theme}
        onChange={handleChange}
        formattingToolbar={false}
        sideMenu={false}
      >
        {/* BlockNote's own side menu is disabled (sideMenu={false}); its handle uses HTML5
            drag, which can't drop in the WKWebView shell. GutterHandle (below) is our own
            pointer-driven handle instead. */}
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
        {/* "/" — the default block menu with BlockNote's built-in media items REMOVED
            (they'd otherwise show as duplicate Image/Video/Audio/File entries), PLUS our
            own two, deliberately distinct, Media commands:
              • Image   — one picture (single-file picker / URL embed)
              • Gallery — several pictures in one block (multi-file picker)
            Both insert our `image` block in its one-input "prompt" state via BlockNote's
            insertOrUpdateBlockForSlashMenu (which reliably clears the typed "/…" text);
            Gallery sets the transient `multiple` flag so the picker allows multi-select and
            2+ chosen files become a gallery (ImageBlock handles the split). */}
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => {
            const MEDIA_KEYS = new Set(["image", "video", "audio", "file"]);
            const MEDIA_TITLES = new Set(["Image", "Video", "Audio", "File", "Embed"]);
            const defaults = getDefaultReactSlashMenuItems(editor).filter((it) => {
              // `key` is dropped from the React item's TS type but survives at runtime;
              // fall back to the (localized) title so we never leave a stray media item.
              const key = (it as { key?: string }).key;
              if (key && MEDIA_KEYS.has(key)) return false;
              return !MEDIA_TITLES.has(it.title);
            });
            return filterSuggestionItems(
              [
                ...defaults,
                {
                  title: "Image",
                  aliases: ["img", "photo", "picture"],
                  group: "Media",
                  icon: <ImageIcon size={18} />,
                  subtext: "Add a single image",
                  onItemClick: () =>
                    insertOrUpdateBlockForSlashMenu(editor, {
                      type: "image",
                      props: { status: "prompt" },
                    } as never),
                },
                {
                  title: "Gallery",
                  aliases: ["images", "album", "photos", "grid"],
                  group: "Media",
                  icon: <ImagesIcon size={18} />,
                  subtext: "Add several images",
                  onItemClick: () =>
                    insertOrUpdateBlockForSlashMenu(editor, {
                      type: "image",
                      props: { status: "prompt", multiple: true },
                    } as never),
                },
              ],
              query,
            );
          }}
        />
        {/* "@" opens a menu to link an existing note (recent-first; filters by title). */}
        <SuggestionMenuController
          triggerCharacter="@"
          getItems={async (query) => {
            const q = query.toLowerCase();
            return notesRef.current
              .filter((n) => n.id !== selfId && (n.title || "Untitled").toLowerCase().includes(q))
              .slice(0, 8)
              .map((n) => ({
                title: n.title || "Untitled",
                icon: <FlaskFor icon={n.icon} chars={n.chars} size={16} />,
                onItemClick: () => {
                  editor.insertInlineContent([
                    { type: "noteLink", props: { noteId: n.id, title: n.title || "Untitled" } },
                    " ",
                  ]);
                },
              }));
          }}
        />
      </BlockNoteView>
      {/* Our pointer-driven drag handle in the left gutter (replaces BlockNote's). */}
      <GutterHandle
        editor={editor as unknown as Parameters<typeof GutterHandle>[0]["editor"]}
        wrapRef={wrapRef}
        startDrag={startBlockDrag}
      />
    </div>
  );
}
