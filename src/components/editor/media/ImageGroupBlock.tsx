import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type DragEvent as ReactDragEvent } from "react";
import {
  parseGalleryImages,
  stringifyGalleryImages,
  type GalleryImage,
} from "../../../lib/md/gallery";
import {
  galleryLayout,
  removeImageAt,
  reorderImages,
} from "./galleryModel";
import { DEFAULT_IMAGE_WIDTH, imageFilename } from "../../../lib/md/image";
import { getMediaNoteId } from "./mediaContext";
import { mergeFilesIntoBlock, type GroupEditor } from "./insertGroup";
import { useMediaBackup } from "./useMediaBackup";
import { MediaRune } from "./MediaRune";
import { mediaAlt, refForUrl } from "../../../lib/media";
import { lightbox } from "../../media/lightboxController";
import { X, GripVertical, Plus, Images as ImagesIcon } from "../../icons";
import { MediaLibrary } from "./MediaLibraryModal";
import { log } from "../../../lib/logger";

// Images from a drop: prefer dataTransfer.files, fall back to items (a copied/screenshot image
// often lives only in items, kind "file") — matches the editor-wide paste/drop plugin.
function imagesFromDT(dt: DataTransfer): File[] {
  const out: File[] = [];
  for (const f of Array.from(dt.files)) if (f.type.startsWith("image/")) out.push(f);
  if (!out.length)
    for (const it of Array.from(dt.items))
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && f.type.startsWith("image/")) out.push(f);
      }
  return out;
}

// Per-tile gold backup rune. A tiny child so the hook is called at a component top level
// (not inside the tiles .map, which would break the rules of hooks).
function TileRune({ url }: { url: string }) {
  const state = useMediaBackup(url ? refForUrl(url) : null);
  return <MediaRune state={state} />;
}

// The inline gallery — several images grouped into ONE block (wiki "inline gallery block").
// It REUSES the MediaBlock CSS language (frame/radius/border, saving/broken states) rather
// than the MediaBlock component itself: a grid tile is object-fit:cover (not the single
// image's contain + max-h), has no per-tile width (layout is count-driven) and no
// caption-below — so, exactly as the lightbox reuses PreviewPortal's CSS without extending
// the component, tiles share the tokens through CSS, not through MediaBlock's render.
//
// Markdown: a `pensieve:gallery` fence, one `ref | caption` line per image, order = display
// order (lib/md/gallery). Collapse/promote: removing down to 1 image turns the block back
// into a single `image` block (degrading the fence to plain `![]()`); a single image gains a
// second (paste/drop/"+") is promoted to this block by insertGroup.

interface BlockEditor {
  isEditable: boolean;
  updateBlock: (id: string, update: unknown) => void;
  insertBlocks: (blocks: unknown[], ref: string, placement: "before" | "after") => Array<{ id: string }>;
}

interface RenderProps {
  block: { id: string; props: { images: string } };
  editor: BlockEditor;
}

function GroupRender({ block, editor }: RenderProps) {
  const editable = editor.isEditable;
  const images = parseGalleryImages(block.props.images);
  const layout = galleryLayout(images.length);

  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [popover, setPopover] = useState<null | "add">(null);
  const [embedding, setEmbedding] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");
  const [library, setLibrary] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const setImages = (next: GalleryImage[]) =>
    editor.updateBlock(block.id, { props: { images: stringifyGalleryImages(next) } });

  const markBroken = (i: number) => setBroken((s) => new Set(s).add(i));

  // Open the lightbox with the WHOLE gallery + the clicked index (Phase 2 handles nav).
  const expand = (i: number, rectEl?: HTMLElement | null) => {
    lightbox.open({
      items: images.map((img) => ({ url: img.url, caption: img.caption || undefined })),
      index: i,
      originRect: rectEl?.getBoundingClientRect(),
      originElement: rectEl ?? null,
    });
    log.info("media", "group.expand", { id: block.id, index: i });
  };

  // Remove a tile. 2→1 collapses the group back to a single `image` block (fence → plain
  // `![]()`); the file is intentionally kept on disk (version/timeline snapshots). ⌘Z-undoable.
  const remove = (i: number) => {
    const next = removeImageAt(images, i);
    if (next.length === 1) {
      editor.updateBlock(block.id, {
        type: "image",
        props: { url: next[0].url, caption: next[0].caption ?? "", width: DEFAULT_IMAGE_WIDTH },
      });
      log.info("media", "group.collapse", { id: block.id });
    } else if (next.length === 0) {
      editor.updateBlock(block.id, { type: "paragraph", props: {} });
    } else {
      setImages(next);
      log.info("media", "group.remove", { id: block.id, remaining: next.length });
    }
  };

  // Lift one tile out into its own single ImageBlock below the group, then drop it from the
  // group (collapsing to a single image if that leaves one behind).
  const liftOut = (i: number) => {
    const img = images[i];
    editor.insertBlocks(
      [{ type: "image", props: { url: img.url, caption: img.caption ?? "", width: DEFAULT_IMAGE_WIDTH } }],
      block.id,
      "after",
    );
    log.info("media", "group.liftout", { id: block.id, index: i });
    remove(i);
  };

  const setCaption = (i: number, caption: string) => {
    const next = images.map((img, j) => (j === i ? { ...img, caption } : img));
    setImages(next);
  };

  const addFiles = (files: File[]) => {
    if (files.length) void mergeFilesIntoBlock(editor as unknown as GroupEditor, getMediaNoteId(), files, block.id);
  };

  // Append already-loadable urls as new tiles (embed link / reused library images) — no new
  // bytes; a library url is ref-registered so it saves straight back to its vault ref.
  const appendUrls = (urls: string[]) => {
    if (urls.length) setImages(images.concat(urls.map((u) => ({ url: u, caption: "" }))));
  };
  const embed = () => {
    const v = embedUrl.trim();
    if (!v) return;
    appendUrls([v]);
    setEmbedUrl("");
    setEmbedding(false);
    setPopover(null);
  };

  // Esc closes the add popover (the embed sub-input handles its own Esc first).
  useEffect(() => {
    if (!popover) return;
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setPopover(null);
      setEmbedding(false);
    };
    document.addEventListener("keydown", onEsc, true);
    return () => document.removeEventListener("keydown", onEsc, true);
  }, [popover]);

  // The add menu (Upload / Choose from library / Embed) — shared by the empty placeholder and
  // the populated grid's "+". Mirrors ImageBlock's placeholder popover. Anchored top-right of
  // the (position:relative) gallery root.
  const addPopover =
    popover === "add" ? (
      <>
        <div className="pensieve-media-popover-backdrop" onPointerDown={() => { setPopover(null); setEmbedding(false); }} />
        <div className="pensieve-media-menu" role="menu">
          {!embedding ? (
            <>
              <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>Upload from computer</button>
              <button type="button" role="menuitem" onClick={() => { setPopover(null); setLibrary(true); }}>Choose from library</button>
              <button type="button" role="menuitem" onClick={() => setEmbedding(true)}>Embed link</button>
              <div className="pensieve-media-menu-hint">or drag &amp; drop images here</div>
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
    ) : null;

  const libraryModal = library ? (
    <MediaLibrary multiple onPick={(urls) => { appendUrls(urls); setLibrary(false); }} onClose={() => setLibrary(false)} />
  ) : null;

  // Drag handlers shared by both layouts — a dashed drop ring, then merge the dropped images.
  // Mirrors ImageBlock's host: stopPropagation so the editor-wide plugin doesn't double-insert.
  const dropProps = editable
    ? {
        onDragOver: (e: ReactDragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); },
        onDragLeave: (e: ReactDragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); },
        onDrop: (e: ReactDragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          addFiles(imagesFromDT(e.dataTransfer));
        },
      }
    : {};

  // ── pointer-based tile reorder (HTML5 drag can't drop in the WKWebView shell) ──
  const insertionIndexAt = (clientX: number, clientY: number): number => {
    const grid = gridRef.current;
    if (!grid) return images.length;
    const tiles = Array.from(grid.querySelectorAll<HTMLElement>("[data-tile]"));
    for (let i = 0; i < tiles.length; i++) {
      const r = tiles[i].getBoundingClientRect();
      // Same row and pointer left of this tile's centre → insert before it.
      if (clientY < r.bottom && clientX < r.left + r.width / 2) return i;
      if (clientY < r.bottom && clientX < r.right) return i + 1;
    }
    return tiles.length;
  };

  const onGripDown = (i: number) => (e: PointerEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    setDragFrom(i);
    const onMove = (ev: globalThis.PointerEvent) => setDropAt(insertionIndexAt(ev.clientX, ev.clientY));
    const onUp = (ev: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const insertion = insertionIndexAt(ev.clientX, ev.clientY);
      const to = insertion > i ? insertion - 1 : insertion;
      if (to !== i && to >= 0 && to < images.length) {
        setImages(reorderImages(images, i, to));
        log.info("media", "group.reorder", { id: block.id, from: i, to });
      }
      setDragFrom(null);
      setDropAt(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onTileKey = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      expand(i, e.currentTarget);
    }
  };

  const hiddenFileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={(e) => {
        addFiles(Array.from(e.target.files ?? []));
        e.target.value = "";
        setPopover(null);
      }}
    />
  );

  // Empty gallery (just inserted via /gallery) → a MediaBlock-style placeholder: click for the
  // add menu (upload / library / embed), or drop images here. Removing the last collapses.
  if (images.length === 0) {
    return (
      <div className={"pensieve-gallery" + (dragOver ? " is-dragover" : "")} contentEditable={false} {...dropProps}>
        <div className="pensieve-media is-shaped" style={{ width: "75%", maxWidth: "100%" }}>
          <div className="pensieve-media-frame is-shaped" style={{ aspectRatio: "3 / 2" }}>
            <div className="pensieve-media-placeholder">
              {editable ? (
                <button type="button" className="pensieve-media-add" onClick={() => setPopover((p) => (p === "add" ? null : "add"))}>
                  <ImagesIcon size={22} />
                  <span>Add images</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {addPopover}
        {libraryModal}
        {hiddenFileInput}
      </div>
    );
  }

  return (
    <div className={"pensieve-gallery" + (dragOver ? " is-dragover" : "")} contentEditable={false} {...dropProps}>
      <div
        ref={gridRef}
        className="pensieve-gallery-grid"
        style={{ gridTemplateColumns: `repeat(${layout.columns}, 1fr)` }}
      >
        {images.slice(0, layout.tilesShown).map((img, i) => {
          const isCover = layout.hasOverflow && i === layout.coverIndex;
          return (
            <div
              key={`${i}-${img.url}`}
              data-tile={i}
              className={
                "pensieve-gallery-tile" +
                (dragFrom === i ? " is-dragging" : "") +
                (broken.has(i) ? " is-broken" : "")
              }
              tabIndex={0}
              onKeyDown={onTileKey(i)}
            >
              {dropAt === i && editable && <div className="pensieve-gallery-insert" aria-hidden />}
              {img.url && !broken.has(i) ? (
                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                <img
                  className="pensieve-gallery-img"
                  src={img.url}
                  alt={mediaAlt(img.caption)}
                  draggable={false}
                  onError={() => markBroken(i)}
                  onClick={(e) => expand(isCover ? layout.coverIndex : i, e.currentTarget.closest(".pensieve-gallery-tile") as HTMLElement)}
                />
              ) : (
                <div className="pensieve-gallery-brokentile">
                  <span className="pensieve-media-filename">{imageFilename(img.url) || "image missing"}</span>
                </div>
              )}

              {img.saving && <div className="pensieve-media-progress" aria-hidden />}
              {!img.saving && img.url && !broken.has(i) && <TileRune url={img.url} />}

              {isCover && (
                <button
                  type="button"
                  className="pensieve-gallery-cover"
                  onClick={() => expand(layout.coverIndex, null)}
                  aria-label={`Show ${layout.overflowMore} more images`}
                >
                  +{layout.overflowMore}
                </button>
              )}

              {editable && !isCover && (
                <>
                  <button
                    type="button"
                    className="pensieve-gallery-remove"
                    title="Remove from gallery"
                    aria-label="Remove image"
                    onClick={() => remove(i)}
                  >
                    <X size={14} />
                  </button>
                  <div
                    className="pensieve-gallery-grip"
                    title="Drag to reorder"
                    aria-label="Reorder image"
                    onPointerDown={onGripDown(i)}
                  >
                    <GripVertical size={14} />
                  </div>
                  <button
                    type="button"
                    className="pensieve-gallery-lift"
                    title="Lift out as its own image"
                    onClick={() => liftOut(i)}
                  >
                    Lift out
                  </button>
                  <input
                    className="pensieve-gallery-caption"
                    value={img.caption ?? ""}
                    placeholder="Caption…"
                    onChange={(e) => setCaption(i, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </>
              )}
              {!editable && img.caption && <div className="pensieve-gallery-caption-static">{img.caption}</div>}
            </div>
          );
        })}

        {editable && (
          <button
            type="button"
            className="pensieve-gallery-add"
            title="Add images"
            aria-label="Add images"
            onClick={() => setPopover((p) => (p === "add" ? null : "add"))}
          >
            <Plus size={20} />
          </button>
        )}
      </div>
      {addPopover}
      {libraryModal}
      {hiddenFileInput}
    </div>
  );
}

export const ImageGroupBlock = createReactBlockSpec(
  {
    type: "imageGroup",
    content: "none",
    propSchema: {
      // The ordered image list as a JSON string (BlockNote props must be primitives);
      // each entry is { url, caption?, saving? } — see lib/md/gallery. SAVE rewrites each
      // url → its vault ref and emits the `pensieve:gallery` fence (encodeImageGroupBlock),
      // so this block is never handed to BlockNote's own Markdown converter.
      images: { default: "[]" },
    },
  },
  {
    render: (props) => <GroupRender block={props.block as never} editor={props.editor as never} />,
  },
)();
