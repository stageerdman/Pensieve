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
import { useCallback, useEffect, useMemo, useRef } from "react";
import { blocksToExtendedMd, extendedMdToBlocks } from "../../lib/md/extended";
import { setNoteLinkOpen, setNoteLinkResolve } from "./noteLink";
import { editorSchema } from "./editorSchema";
import { BlockSelectionDecorations } from "./blockSelectionDecorations";
import { ImagePasteDrop, setImageDropHandlers } from "./media/imagePasteDrop";
import { setMediaNoteId } from "./media/mediaContext";
import { makeUploadFile } from "./media/insertImage";
import { insertImagesSmart, type GroupEditor } from "./media/insertGroup";
import { mediaToast } from "./media/mediaToast";
import { Image as ImageIcon, Images as ImagesIcon, AudioLines as AudioIcon } from "../icons";
import { GutterHandle } from "./GutterHandle";
import { makeSlashMenu } from "./SlashMenu";
import { useBlockMarquee } from "./useBlockMarquee";
import { useBlockDrag } from "./useBlockDrag";
import { FlaskFor } from "../Flask";
import { findScrollParent } from "./dragScroll";
import type { EditorPosition } from "./editorPosition";
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

// The minimal slice of the editor restorePosition needs: the raw ProseMirror view
// (to set the caret) and focus(). Kept loose so we don't fight BlockNote's generics.
interface PositionableEditor {
  prosemirrorView?: EditorView;
  focus: () => void;
}

// Put the caret back where it was and the surface scrolled to where it was. The caret
// goes first (focus() may nudge the view), then we force scrollTop last so it wins —
// once now and once next frame, in case block/image layout settles after this tick.
// Positions are clamped and the whole thing is best-effort: a doc that changed since
// capture just lands the caret somewhere valid rather than throwing.
function restorePosition(
  editor: PositionableEditor,
  scroller: HTMLElement | null,
  pos: EditorPosition,
  cancelled: () => boolean,
): void {
  const view = editor.prosemirrorView;
  if (view) {
    const size = view.state.doc.content.size;
    const anchor = Math.max(0, Math.min(pos.anchor ?? 0, size));
    const head = Math.max(0, Math.min(pos.head ?? anchor, size));
    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
    } catch {
      /* the saved offsets may no longer resolve to a text position — leave the default */
    }
    // Focus without letting the browser scroll the caret into view; we set scroll next.
    view.dom.focus({ preventScroll: true });
  } else {
    editor.focus();
  }
  if (scroller) {
    scroller.scrollTop = pos.scrollTop;
    requestAnimationFrame(() => {
      if (!cancelled() && scroller) scroller.scrollTop = pos.scrollTop;
    });
  }
}

// The writing surface — a Notion-like BLOCK editor (BlockNote). Blocks are
// draggable, "/" opens the slash menu, and a selection bubble covers inline
// styling, all out of the box. Content is Markdown in, Markdown out through our
// extended standard (lib/md/extended) — the `.md` file stays the source of truth.
//
// The parent remounts this per note (key={note.id}), so markdown is loaded once
// on mount and we never fight an incoming prop mid-edit. Because of that remount, we
// also save/restore *where you were writing* per note (scroll offset + caret) through
// savedPosition/onSavePosition — so switching tabs lands you back where you left off
// instead of at the default focus spot. See editorPosition.ts.

interface EditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
  focusMode: boolean;
  theme: "light" | "dark";
  selfId: string; // the current note — excluded from the "@" menu (no self-links)
  notes: NoteMeta[]; // for the "@" note-link menu
  onOpenNote: (id: string) => void; // clicking a note link opens it
  savedPosition?: EditorPosition | null; // where we were last writing in this note (if remembered)
  onSavePosition?: (noteId: string, pos: EditorPosition) => void; // report the live position
}

export function Editor({
  markdown,
  onChange,
  focusMode,
  theme,
  selfId,
  notes,
  onOpenNote,
  savedPosition,
  onSavePosition,
}: EditorProps) {
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
  // The surface the editor actually scrolls inside (App's <section>). Resolved once the
  // editor is in the DOM; kept so we can read/restore its scrollTop without re-walking.
  const scrollerRef = useRef<HTMLElement | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  // Snapshot where we are right now (scroll + caret) into the parent's per-note memory.
  // Called while editing (onChange), on scroll, and on blur — i.e. right before a tab
  // switch — so the remembered position is always current. Never called on unmount, so
  // closing a tab (which forgets the entry) is not undone by a stale final write.
  const captureSave = useCallback(() => {
    if (loading.current || !onSavePosition) return;
    const sel = editor.prosemirrorView?.state.selection;
    onSavePosition(selfId, {
      scrollTop: scrollerRef.current?.scrollTop ?? 0,
      anchor: sel?.anchor,
      head: sel?.head,
    });
  }, [editor, selfId, onSavePosition]);

  // Notion-style marquee: drag in the blank margin to select multiple rows, then move
  // them together with the drag handle (useBlockMarquee sets the selection; BlockNote's
  // handle does the move).
  useBlockMarquee(editor, wrapRef);
  // Pointer-based block drag (BlockNote's HTML5 drag can't drop in the WKWebView shell).
  // Cast: the hook needs only a small slice of the editor; BlockNote's full generic type
  // over-constrains insertBlocks' argument, so we adapt to the hook's minimal interface.
  const startBlockDrag = useBlockDrag(editor as unknown as Parameters<typeof useBlockDrag>[0], wrapRef);

  // Our own slash-menu component — owns keyboard nav (see SlashMenu.tsx); the built-in
  // menu's keys didn't drive selection in the WKWebView shell.
  const slashMenu = useMemo(() => makeSlashMenu(editor as never), [editor]);

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
  // Once blocks are in (the doc now has height), we either restore the remembered
  // scroll + caret for this note, or — first visit / after a close — just focus.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const blocks = await extendedMdToBlocks(editor, markdown);
      if (cancelled) return;
      loadBlocksWithoutHistory(editor as unknown as LoadableEditor, blocks);
      loading.current = false;
      const scroller = scrollerRef.current ?? findScrollParent(wrapRef.current);
      scrollerRef.current = scroller;
      try {
        if (savedPosition) restorePosition(editor, scroller, savedPosition, () => cancelled);
        else editor.focus();
      } catch {
        /* restore/focus is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the remembered position current: as you scroll the surface, and when focus
  // leaves the editor (the moment you click another tab). Resolve the scroller here
  // too, since this synchronous mount effect runs before the async load above.
  useEffect(() => {
    const el = wrapRef.current;
    const scroller = scrollerRef.current ?? findScrollParent(el);
    scrollerRef.current = scroller;
    if (!el) return;
    const onScroll = () => captureSave();
    const onLeave = () => captureSave();
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("focusout", onLeave);
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      el.removeEventListener("focusout", onLeave);
    };
  }, [captureSave]);

  const handleChange = async () => {
    if (loading.current) return;
    onChange(await blocksToExtendedMd(editor, editor.document));
    captureSave();
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
        // Disable BlockNote's BUILT-IN slash menu — our own "/" SuggestionMenuController
        // (below) fully replaces it. Leaving the default on rendered TWO slash popups at
        // once (ours + BlockNote's), so Enter inserted twice (our Image prompt AND the
        // default image block → an empty "Image Missing" block) and focus fought over Tab.
        slashMenu={false}
        // We own the image block + its prompt, so BlockNote's default file-upload panel
        // must not pop up either.
        filePanel={false}
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
            Both insert our `image`/`imageGroup` block via BlockNote's
            insertOrUpdateBlockForSlashMenu. That helper only REPLACES the current block in
            place when it's empty, so SlashMenu.activate clears the typed "/…" text first (see
            SlashMenu.tsx) — otherwise the block inserts AFTER the "/ima" paragraph and the
            command text survives. Gallery starts empty; 2+ chosen files become a gallery. */}
        <SuggestionMenuController
          triggerCharacter="/"
          suggestionMenuComponent={slashMenu as never}
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
                  subtext: "A single image",
                  // Insert an EMPTY image block — it renders a placeholder you click to
                  // upload / embed / drop (ImageBlock), not an inline URL prompt.
                  onItemClick: () =>
                    insertOrUpdateBlockForSlashMenu(editor, { type: "image", props: {} } as never),
                },
                {
                  title: "Gallery",
                  aliases: ["images", "album", "photos", "grid"],
                  group: "Media",
                  icon: <ImagesIcon size={18} />,
                  subtext: "Several images in one block",
                  // Insert an EMPTY gallery placeholder (multi-image picker on click).
                  onItemClick: () =>
                    insertOrUpdateBlockForSlashMenu(editor, { type: "imageGroup", props: { images: "[]" } } as never),
                },
                {
                  title: "Audio",
                  aliases: ["audio", "voice", "recording", "sound", "mic", "record"],
                  group: "Media",
                  icon: <AudioIcon size={18} />,
                  subtext: "A voice recording or audio file",
                  // Insert an EMPTY audio block — a placeholder to choose a file (recording = P4).
                  onItemClick: () =>
                    insertOrUpdateBlockForSlashMenu(editor, { type: "audio", props: {} } as never),
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
