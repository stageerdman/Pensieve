import { createReactBlockSpec, useSelectedBlocks } from "@blocknote/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
import { runResizeDrag, useResizeHandle } from "./mediaResize";
import { MediaLibrary } from "./MediaLibraryModal";
import { insertImagesSmart, type GroupEditor } from "./insertGroup";
import { Image as ImageIcon, MoreHorizontal, Move as MoveIcon, Trash as TrashIcon } from "../../icons";
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
  posX: number; // object-position X% (0..100) — only meaningful when cropped (cover)
  posY: number; // object-position Y% (0..100)
  status: string;
  filename: string;
}
interface RenderProps {
  block: { id: string; props: Props };
  editor: InsertEditor & { isEditable: boolean; removeBlocks?: (ids: string[]) => void };
}

function ImageRender({ block, editor }: RenderProps) {
  const { url, caption, width, aspect, posX, posY, status } = block.props;
  const editable = editor.isEditable;
  const selectedBlocks = useSelectedBlocks(editor as never);
  const selected = editable && selectedBlocks.length === 1 && selectedBlocks[0].id === block.id;

  const [focused, setFocused] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [popover, setPopover] = useState<null | "menu" | "add">(null);
  const [embedding, setEmbedding] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [panning, setPanning] = useState(false);
  const [library, setLibrary] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Latest object-position, read live at pan-drag start (props change mid-pan).
  const posRef = useRef({ x: posX, y: posY });
  posRef.current = { x: posX, y: posY };

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

  // Only a cropped (explicit-aspect = object-fit:cover) image can be repositioned — a natural
  // image fills its box with no overflow to pan into.
  const cropped = state === "loaded" && !!aspect && aspect > 0;

  // Leave pan mode if the image stops being croppable (e.g. "Restore to original").
  useEffect(() => {
    if (!cropped) setPanning(false);
  }, [cropped]);

  // Esc closes the ⋯ menu / add popover and exits pan mode (capture phase so it wins over the
  // editor). Only mounted while something is open, so it never swallows a stray Esc.
  useEffect(() => {
    if (!popover && !panning) return;
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setPanning(false);
      setPopover(null);
      setEmbedding(false);
    };
    document.addEventListener("keydown", onEsc, true);
    return () => document.removeEventListener("keydown", onEsc, true);
  }, [popover, panning]);

  // Pan mode: a NATIVE mousedown on the image frame drags the image inside its cropped box
  // (same native-event reason as the resize handles — ProseMirror only stops a mousedown).
  // object-position % maps 1:1 to pixels via the cover overflow, clamped to [0,100] so an edge
  // can never pull inward and expose a transparent gap.
  useEffect(() => {
    if (!panning) return;
    const host = frameRef.current;
    const frame = host?.querySelector<HTMLElement>(".pensieve-media-frame");
    const img = host?.querySelector<HTMLImageElement>(".pensieve-media-img");
    if (!frame || !img) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const fr = frame.getBoundingClientRect();
      const natW = img.naturalWidth || fr.width;
      const natH = img.naturalHeight || fr.height;
      const scale = Math.max(fr.width / natW, fr.height / natH);
      const overflowX = Math.max(0, natW * scale - fr.width);
      const overflowY = Math.max(0, natH * scale - fr.height);
      const start = posRef.current;
      const sx = e.clientX;
      const sy = e.clientY;
      const clamp = (v: number) => Math.min(100, Math.max(0, v));
      log.debug("media", "pan.start", { id: block.id });
      runResizeDrag((cx, cy) => {
        // Drag the image right → reveal more of its left → object-position X decreases.
        const nx = overflowX > 0 ? clamp(start.x - ((cx - sx) / overflowX) * 100) : start.x;
        const ny = overflowY > 0 ? clamp(start.y - ((cy - sy) / overflowY) * 100) : start.y;
        update({ posX: nx, posY: ny });
      });
    };
    frame.addEventListener("mousedown", onDown);
    return () => frame.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panning, block.id]);

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

  // Right-edge handle — width only, snapped. `.pensieve-media` is a DESCENDANT of the host
  // (frameRef) → querySelector, not closest (the old closest() returned null, so the drag
  // returned before it ever began). Its parent is the host, whose width is the text column.
  const resizeHandleRef = useResizeHandle(() => {
    const media = frameRef.current?.querySelector<HTMLElement>(".pensieve-media");
    const column = media?.parentElement;
    if (!media || !column) return;
    const left = media.getBoundingClientRect().left;
    const colWidth = column.clientWidth || 1;
    log.debug("media", "resize.start", { id: block.id, kind: "width" });
    runResizeDrag((cx) => update({ width: snapWidth(Math.min(1, Math.max(0.15, (cx - left) / colWidth))) }));
  });

  // Bottom-right corner — free reshape (width + aspect together), works on the placeholder too.
  const cornerHandleRef = useResizeHandle((startX, startY) => {
    const frame = rectEl();
    const media = frameRef.current?.querySelector<HTMLElement>(".pensieve-media");
    const column = media?.parentElement;
    if (!frame || !column) return;
    const r = frame.getBoundingClientRect();
    const colWidth = column.clientWidth || 1;
    log.debug("media", "resize.start", { id: block.id, kind: "corner" });
    runResizeDrag((cx, cy) => update(cornerResize(r.width, r.height, cx - startX, cy - startY, colWidth)));
  });

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
      className={"pensieve-media-host" + (dragOver ? " is-dragover" : "") + (panning ? " is-panning" : "")}
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
        objectPosition={`${posX ?? 50}% ${posY ?? 50}%`}
        state={state}
        filename={imageFilename(url)}
        selected={selected}
        focused={focused}
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
              {state !== "empty" && <div className="pensieve-media-resize" ref={resizeHandleRef} aria-label="Resize width" />}
              <div className="pensieve-media-corner" ref={cornerHandleRef} aria-label="Reshape box" />
              <div className="pensieve-media-tools" contentEditable={false}>
                {/* No Expand button (double-click the image opens the lightbox) and no Caption
                    button (the caption input shows below the image whenever it's selected).
                    Replace lives in the ⋯ menu now (it's not a frequent action). */}
                {cropped && (
                  <button
                    type="button"
                    className={"pensieve-media-tool-icon" + (panning ? " is-active" : "")}
                    title="Reposition image"
                    aria-label="Reposition image"
                    aria-pressed={panning}
                    onClick={() => setPanning((p) => !p)}
                  >
                    <MoveIcon size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="pensieve-media-tool-icon"
                  title="Size & shape"
                  aria-label="Size and shape"
                  onClick={() => setPopover((p) => (p === "menu" ? null : "menu"))}
                >
                  <MoreHorizontal size={15} />
                </button>
                <button type="button" className="pensieve-media-tool-icon" title="Remove" aria-label="Remove" onClick={removeSelf}>
                  <TrashIcon size={15} />
                </button>
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
                    {state !== "empty" && (
                      <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>Replace image…</button>
                    )}
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
                        <button type="button" role="menuitem" onClick={() => { setPopover(null); setLibrary(true); }}>Choose from library</button>
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
      {library && (
        <MediaLibrary
          onPick={(urls) => {
            // Reuse an existing vault image: its ref↔url is already registered, so saving
            // rewrites straight back to the vault ref (no new bytes written).
            if (urls[0]) update({ url: urls[0], status: "" });
            setLibrary(false);
          }}
          onClose={() => setLibrary(false)}
        />
      )}
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
      posX: { default: 50, type: "number" }, // object-position X% when cropped (50 = centred)
      posY: { default: 50, type: "number" }, // object-position Y%
      // Transient (never serialized — lib/md/image reads only url/caption/width/aspect/posX/posY):
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
