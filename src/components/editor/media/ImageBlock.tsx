import { createReactBlockSpec, useSelectedBlocks } from "@blocknote/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MediaBlock, type MediaState } from "./MediaBlock";
import {
  DEFAULT_WIDTH,
  snapWidth,
  stepWidth,
  presetWidth,
  widthPreset,
  cornerResize,
  restoreShape,
  type SizePreset,
} from "./mediaShape";
import { imageFilename } from "../../../lib/md/image";
import { getMediaNoteId, expandImage } from "./mediaContext";
import { persistIntoBlock, type InsertEditor } from "./insertImage";
import { insertImagesSmart, type GroupEditor } from "./insertGroup";
import { useMediaBackup } from "./useMediaBackup";
import { refForUrl } from "../../../lib/media";
import { Image as ImageIcon, Expand as ExpandIcon, MoreHorizontal } from "../../icons";
import { log } from "../../../lib/logger";

// The custom `image` block — renders in the Pensieve MediaBlock language (not BlockNote's
// default upload card). Empty = a placeholder you CLICK to add an image (upload / embed /
// drop); the ⋯ menu edits the box size + shape even when empty; "Restore to original"
// returns to the uploaded image's natural dimensions (or the default empty box).
//   • props: url (loadable in-editor), caption (= alt), width (fraction of the column),
//     aspect (box w/h; 0 = natural), + transient status/filename (never serialized).
//   • parse/toExternalHTML: `<img src alt>` ↔ `![caption](ref)` for the default-shape case;
//     a resized/reshaped image rides the `pensieve:image` fence (lib/md/image).

interface Props {
  url: string;
  caption: string;
  width: number;
  aspect: number;
  status: string;
  filename: string;
}
interface RenderProps {
  block: { id: string; props: Props };
  editor: InsertEditor & { isEditable: boolean; removeBlocks?: (ids: string[]) => void };
}

// Begin a pointer drag from a resize/reshape handle. In the WKWebView shell, dragging a handle
// over the contentEditable surface selects the note text instead of resizing: ProseMirror starts
// a selection from the mousedown/selectstart events, and its listeners sit on an ancestor that
// fires BEFORE any React handler — so neither preventDefault on our pointerdown nor an onMouseDown
// can stop it. We therefore cancel `selectstart` at the document level (capture phase) for the
// drag's whole duration — the definitive stop for a mouse-drag text selection. We also capture the
// pointer to the handle (so moves keep flowing past the frame) and drop a body class that sets
// user-select:none as a belt-and-suspenders. `onMove` gets each raw pointer move.
function beginHandleDrag(e: PointerEvent, onMove: (ev: globalThis.PointerEvent) => void): void {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget as HTMLElement;
  const pointerId = e.pointerId;
  log.debug("media", "resize.start", { handle: handle.className, pointerId, pointerType: e.pointerType });
  try {
    handle.setPointerCapture(pointerId);
  } catch {
    /* capture is best-effort */
  }
  document.body.classList.add("pensieve-resizing");
  window.getSelection()?.removeAllRanges();
  const blockSelect = (ev: Event) => ev.preventDefault();
  document.addEventListener("selectstart", blockSelect, true);
  const move = (ev: globalThis.PointerEvent) => {
    ev.preventDefault();
    onMove(ev);
  };
  const done = () => {
    // Listeners are registered in the CAPTURE phase (see below) — remove with the same flag.
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", done, true);
    window.removeEventListener("pointercancel", done, true);
    document.removeEventListener("selectstart", blockSelect, true);
    document.body.classList.remove("pensieve-resizing");
    try {
      handle.releasePointerCapture(pointerId);
    } catch {
      /* best-effort */
    }
  };
  // CAPTURE phase, like the (working) block drag: a pointermove listener in BlockNote/
  // ProseMirror stops propagation before the event bubbles to window, so a bubble-phase
  // listener here never fires and the drag does nothing. Capture runs first, before any
  // stopPropagation, so our move handler reliably sees every move.
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", done, true);
  window.addEventListener("pointercancel", done, true);
}

function ImageRender({ block, editor }: RenderProps) {
  const { url, caption, width, aspect, status } = block.props;
  const editable = editor.isEditable;
  const selectedBlocks = useSelectedBlocks(editor as never);
  const selected = editable && selectedBlocks.length === 1 && selectedBlocks[0].id === block.id;

  const [focused, setFocused] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [popover, setPopover] = useState<null | "menu" | "add">(null);
  const [embedding, setEmbedding] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const backup = useMediaBackup(url ? refForUrl(url) : null);
  const frameRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setImgError(false), [url]);
  // Close popovers when the block is deselected.
  useEffect(() => {
    if (!selected) {
      setPopover(null);
      setEmbedding(false);
    }
  }, [selected]);

  const update = (props: Partial<Props>) => editor.updateBlock(block.id, { props });
  const removeSelf = () => {
    editor.updateBlock(block.id, { type: "paragraph", props: {} } as never);
    log.info("media", "block.remove", { id: block.id });
  };

  const state: MediaState = imgError
    ? "broken"
    : status === "saving"
      ? "saving"
      : url
        ? "loaded"
        : "empty";

  const rectEl = (): HTMLElement | null =>
    (frameRef.current?.querySelector(".pensieve-media-frame") as HTMLElement | null) ?? frameRef.current;
  const expand = () => url && expandImage(url, caption, frameRef.current, rectEl());

  // Fill this (empty) block from chosen/dropped files: 1 → single image here; 2+ → gallery.
  const fillFromFiles = (files: File[]) => {
    if (!files.length) return;
    const noteId = getMediaNoteId();
    if (files.length === 1) {
      void persistIntoBlock(editor, noteId, files[0], block.id);
    } else {
      void insertImagesSmart(editor as unknown as GroupEditor, noteId, files, block.id);
      removeSelf();
    }
    setPopover(null);
  };

  const embed = () => {
    const v = embedUrl.trim();
    if (!v) return;
    update({ url: v, status: "" });
    setEmbedUrl("");
    setEmbedding(false);
    setPopover(null);
  };

  // ── keyboard on the selected block: width (⌘[/⌘]); delete removes an empty placeholder ──
  const onKeyDown = (e: KeyboardEvent) => {
    if (!editable) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === "[" || e.key === "]")) {
      e.preventDefault();
      update({ width: stepWidth(width || DEFAULT_WIDTH, e.key === "]" ? 1 : -1) });
    } else if ((e.key === "Backspace" || e.key === "Delete") && state === "empty") {
      e.preventDefault();
      removeSelf();
    }
  };

  // Right-edge handle — width only, snapped.
  const startResize = (e: PointerEvent) => {
    const media = frameRef.current?.closest(".pensieve-media") as HTMLElement | null;
    const column = media?.parentElement;
    if (!media || !column) return;
    const left = media.getBoundingClientRect().left;
    const colWidth = column.clientWidth || 1;
    beginHandleDrag(e, (ev) => update({ width: snapWidth(Math.min(1, Math.max(0.15, (ev.clientX - left) / colWidth))) }));
  };

  // Bottom-right corner — free reshape (width + aspect together), works on the placeholder too.
  const startCorner = (e: PointerEvent) => {
    const frame = rectEl();
    const media = frameRef.current?.closest(".pensieve-media") as HTMLElement | null;
    const column = media?.parentElement;
    if (!frame || !column) return;
    const r = frame.getBoundingClientRect();
    const colWidth = column.clientWidth || 1;
    const sx = e.clientX;
    const sy = e.clientY;
    beginHandleDrag(e, (ev) => update(cornerResize(r.width, r.height, ev.clientX - sx, ev.clientY - sy, colWidth)));
  };

  const setPreset = (p: SizePreset) => {
    update({ width: presetWidth(p) });
    setPopover(null);
  };
  const restore = () => {
    update(restoreShape());
    setPopover(null);
  };

  const showControls = editable && (selected || focused) && state !== "broken";
  const activePreset = widthPreset(width || DEFAULT_WIDTH);

  return (
    <div
      ref={frameRef}
      className={"pensieve-media-host" + (dragOver ? " is-dragover" : "")}
      contentEditable={false}
      tabIndex={editable ? 0 : -1}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
      // stopPropagation so the editor-wide paste/drop plugin doesn't ALSO handle this drop
      // (it would double-insert); this block owns a drop that lands on it.
      onDragOver={editable ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); } : undefined}
      onDragLeave={() => setDragOver(false)}
      onDrop={
        editable
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
              if (files.length) fillFromFiles(files);
            }
          : undefined
      }
    >
      <MediaBlock
        url={url}
        alt={caption}
        width={width || DEFAULT_WIDTH}
        aspect={aspect}
        state={state}
        filename={imageFilename(url)}
        selected={selected}
        focused={focused}
        backup={backup}
        onImgError={() => setImgError(true)}
        onActivate={() => state === "loaded" && expand()}
        onLocate={editable ? () => fileRef.current?.click() : undefined}
        placeholder={
          <button
            type="button"
            className="pensieve-media-add"
            onClick={() => setPopover((p) => (p === "add" ? null : "add"))}
          >
            <ImageIcon size={22} />
            <span>Add an image</span>
          </button>
        }
        overlay={
          showControls ? (
            <>
              {state !== "empty" && <div className="pensieve-media-resize" onPointerDown={startResize} aria-label="Resize width" />}
              <div className="pensieve-media-corner" onPointerDown={startCorner} aria-label="Reshape box" />
              <div className="pensieve-media-tools" contentEditable={false}>
                {state === "loaded" && (
                  <button type="button" className="pensieve-media-tool-icon" title="Expand" aria-label="Expand image" onClick={expand}>
                    <ExpandIcon size={15} />
                  </button>
                )}
                {state === "loaded" && <button type="button" onClick={() => captionRef.current?.focus()}>Caption</button>}
                {state !== "empty" && <button type="button" onClick={() => fileRef.current?.click()}>Replace</button>}
                <button
                  type="button"
                  className="pensieve-media-tool-icon"
                  title="Size & shape"
                  aria-label="Size and shape"
                  onClick={() => setPopover((p) => (p === "menu" ? null : "menu"))}
                >
                  <MoreHorizontal size={15} />
                </button>
                <button type="button" onClick={removeSelf}>Remove</button>
              </div>

              {popover === "menu" && (
                <>
                  <div className="pensieve-media-popover-backdrop" onPointerDown={() => setPopover(null)} />
                  <div className="pensieve-media-menu" role="menu">
                    <div className="pensieve-media-menu-label">Size</div>
                    {(["small", "medium", "large", "full"] as SizePreset[]).map((p) => (
                      <button key={p} type="button" role="menuitem" className={activePreset === p ? "is-active" : ""} onClick={() => setPreset(p)}>
                        {p[0].toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                    <div className="pensieve-media-menu-sep" />
                    <button type="button" role="menuitem" onClick={restore}>Restore to original</button>
                  </div>
                </>
              )}

              {popover === "add" && state === "empty" && (
                <>
                  <div className="pensieve-media-popover-backdrop" onPointerDown={() => { setPopover(null); setEmbedding(false); }} />
                  <div className="pensieve-media-menu" role="menu">
                    {!embedding ? (
                      <>
                        <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>Upload from computer</button>
                        <button type="button" role="menuitem" onClick={() => setEmbedding(true)}>Embed link</button>
                        <div className="pensieve-media-menu-hint">or drag &amp; drop an image here</div>
                      </>
                    ) : (
                      <input
                        className="pensieve-media-embed-input"
                        autoFocus
                        placeholder="Paste an image URL, then Enter"
                        value={embedUrl}
                        onChange={(e) => setEmbedUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); embed(); }
                          else if (e.key === "Escape") { e.preventDefault(); setEmbedding(false); }
                        }}
                      />
                    )}
                  </div>
                </>
              )}
            </>
          ) : null
        }
        caption={
          editable && selected && state === "loaded" ? (
            <input
              ref={captionRef}
              className="pensieve-media-caption-input"
              value={caption}
              placeholder="Add a caption…"
              onChange={(e) => update({ caption: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  frameRef.current?.focus();
                }
              }}
            />
          ) : caption && state === "loaded" ? (
            <div className="pensieve-media-caption">{caption}</div>
          ) : null
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void persistIntoBlock(editor, getMediaNoteId(), f, block.id);
          e.target.value = "";
          setPopover(null);
        }}
      />
    </div>
  );
}

export const ImageBlock = createReactBlockSpec(
  {
    type: "image",
    content: "none",
    propSchema: {
      url: { default: "" },
      caption: { default: "" },
      width: { default: DEFAULT_WIDTH, type: "number" },
      aspect: { default: 0, type: "number" }, // box w/h; 0 = natural
      // Transient (never serialized — lib/md/image reads only url/caption/width/aspect):
      status: { default: "" }, // "" | "saving"
      filename: { default: "" },
    },
  },
  {
    render: (props) => <ImageRender block={props.block as never} editor={props.editor as never} />,
    parse: (el) =>
      el.tagName === "IMG"
        ? { url: el.getAttribute("src") ?? "", caption: el.getAttribute("alt") ?? "" }
        : undefined,
    // eslint-disable-next-line jsx-a11y/alt-text
    toExternalHTML: ({ block }) => <img src={(block.props as { url: string }).url} alt={(block.props as { caption: string }).caption} />,
  },
)();
