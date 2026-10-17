import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type DragEvent as ReactDragEvent } from "react";
import {
  parseGalleryImages,
  stringifyGalleryImages,
  type GalleryImage,
} from "../../../lib/md/gallery";
import { removeImageAt, reorderImages } from "./galleryModel";
import { justifyGallery } from "./galleryJustify";
import { useResizeHandle } from "./mediaResize";
import { computeDrop, type DropBlock, type DropTarget } from "../blockDrag";
import { DEFAULT_IMAGE_WIDTH, imageFilename } from "../../../lib/md/image";
import { getMediaNoteId } from "./mediaContext";
import { mergeFilesIntoBlock, type GroupEditor } from "./insertGroup";
import { GalleryAudioTile } from "./GalleryAudioTile";
import { mediaAlt } from "../../../lib/media";
import { lightbox } from "../../media/lightboxController";
import { X, GripVertical, Plus, Images as ImagesIcon } from "../../icons";
import { MediaLibrary } from "./MediaLibraryModal";
import { log } from "../../../lib/logger";

// Scan the editor's block rows (from the ProseMirror root containing `fromEl`) so a tile dragged
// OUT of the gallery can land at a document position — a lightweight mirror of useBlockDrag's scan.
function scanDocBlocks(fromEl: HTMLElement | null): { blocks: DropBlock[]; rects: Map<string, DOMRect> } {
  const rects = new Map<string, DOMRect>();
  const blocks: DropBlock[] = [];
  const root = fromEl?.closest(".ProseMirror") as HTMLElement | null;
  if (!root) return { blocks, rects };
  root.querySelectorAll<HTMLElement>('[data-node-type="blockContainer"][data-id]').forEach((el) => {
    const id = el.getAttribute("data-id");
    if (!id) return;
    const content = (el.querySelector<HTMLElement>(":scope > .bn-block-content") ?? el) as HTMLElement;
    const r = content.getBoundingClientRect();
    rects.set(id, r);
    blocks.push({ id, top: r.top, bottom: r.bottom, left: r.left, canNest: false });
  });
  return { blocks, rects };
}

// Draw/clear the body-level drop line for an out-of-gallery extraction (reuses .pensieve-drop-
// indicator). `ref` holds the element across moves.
function drawDocDrop(target: DropTarget | null, rects: Map<string, DOMRect>, ref: { current: HTMLDivElement | null }): void {
  const r = target && rects.get(target.referenceId);
  if (!target || !r) {
    ref.current?.remove();
    ref.current = null;
    return;
  }
  if (!ref.current) {
    ref.current = document.createElement("div");
    ref.current.className = "pensieve-drop-indicator";
    document.body.appendChild(ref.current);
  }
  const y = target.placement === "before" ? r.top : r.bottom;
  const el = ref.current;
  el.style.height = "";
  el.style.left = `${r.left}px`;
  el.style.top = `${y - 1}px`;
  el.style.width = `${Math.max(40, r.right - r.left)}px`;
}

// Pinterest-style justified strip tuning.
const GALLERY_GAP = 4; // px between tiles and rows
const TARGET_ROW_H = 220; // the per-row height the row count aims for
const MAX_ROWS = 4; // never stack more than this many rows
const DEFAULT_GALLERY_HEIGHT = 260; // px, before the user drags
const MIN_GALLERY_HEIGHT = 120;
const MAX_GALLERY_HEIGHT = 640;
const DEFAULT_ASPECT = 1.5; // optimistic landscape until an image reports its natural size
const AUDIO_ASPECT = 1.85; // a fixed landscape for audio cards — they ride the strip like a wide photo

// Images from a drop: prefer dataTransfer.files, fall back to items (a copied/screenshot image
// often lives only in items, kind "file"). IMAGES only — an audio drop onto the gallery is
// routed through the editor's native paste/drop plugin instead (React's synthetic drop
// dataTransfer is unreliable for audio files in the WKWebView shell), which calls back into
// the gallery merge with the audio tagged kind:"audio".
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
  block: { id: string; props: { images: string; height?: number } };
  editor: BlockEditor;
}

function GroupRender({ block, editor }: RenderProps) {
  const editable = editor.isEditable;
  const images = parseGalleryImages(block.props.images);

  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [popover, setPopover] = useState<null | "add">(null);
  const [embedding, setEmbedding] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");
  const [library, setLibrary] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Natural aspect ratios (w/h) keyed by url, measured on <img onLoad>. Kept in LOCAL state (never
  // serialized / written to the block) so backfilling them never dirties the note. Drives the layout.
  const [aspects, setAspects] = useState<Record<string, number>>({});
  // The live gallery height while the user drags the handle (null = use the saved prop).
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docDropRef = useRef<HTMLDivElement | null>(null); // extract-out drop line (body-level)

  const containerHeight = liveHeight ?? (Number(block.props.height) || DEFAULT_GALLERY_HEIGHT);
  const onTileLoad = (url: string, el: HTMLImageElement) => {
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    if (!w || !h) return;
    const ar = w / h;
    setAspects((prev) => (Math.abs((prev[url] ?? 0) - ar) < 1e-3 ? prev : { ...prev, [url]: ar }));
  };
  // The justified horizontal layout: dragged height → rows → per-tile widths (ratio preserved).
  const packed = justifyGallery(
    // Audio tiles use a FIXED aspect (they're not aspect-measured like images); the justify
    // packer treats it like any other number, so they scale with the row height for free.
    images.map((img) => (img.kind === "audio" ? AUDIO_ASPECT : aspects[img.url] ?? DEFAULT_ASPECT)),
    { containerHeight, gap: GALLERY_GAP, targetRowH: TARGET_ROW_H, maxRows: MAX_ROWS },
  );

  // Drag the bottom handle to resize the gallery height; preview live, commit once on release.
  const heightHandleRef = useResizeHandle((_startX, startY) => {
    const startH = containerHeight;
    let last = startH;
    const move = (ev: MouseEvent | TouchEvent) => {
      const y = "touches" in ev ? ev.touches[0]?.clientY ?? startY : ev.clientY;
      last = Math.min(MAX_GALLERY_HEIGHT, Math.max(MIN_GALLERY_HEIGHT, startH + (y - startY)));
      setLiveHeight(last);
    };
    const end = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchend", end);
      document.body.classList.remove("pensieve-resizing");
      setLiveHeight(null);
      // Commit the dragged height to the block prop (round-trips via the fence `h=` header).
      editor.updateBlock(block.id, { props: { height: Math.round(last) } });
    };
    document.body.classList.add("pensieve-resizing");
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end);
  });

  // Never leave the body-level drop line behind if we unmount mid-drag.
  useEffect(() => () => drawDocDrop(null, new Map(), docDropRef), []);

  // Safety net: never let the drop-highlight ring stick on. If a drag ends anywhere (a drop that
  // didn't land on us, or a cancelled drag), clear it. (Fixes the occasional "stuck during drop".)
  useEffect(() => {
    if (!dragOver) return;
    const clear = () => setDragOver(false);
    window.addEventListener("drop", clear, true);
    window.addEventListener("dragend", clear, true);
    return () => {
      window.removeEventListener("drop", clear, true);
      window.removeEventListener("dragend", clear, true);
    };
  }, [dragOver]);

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
          const imgs = imagesFromDT(e.dataTransfer);
          log.info("media", "gallery.reactDrop", {
            id: block.id,
            files: Array.from(e.dataTransfer?.files ?? []).map((f) => `${f.name}:${f.type || "?"}`),
            images: imgs.length,
          });
          addFiles(imgs);
        },
      }
    : {};

  // ── pointer-based tile reorder (HTML5 drag can't drop in the WKWebView shell) ──
  // A flat insertion index 0..n, found from the nearest tile centre (works across the justified
  // strip's multiple rows): before it if the pointer is left of its centre, else after.
  const insertionIndexAt = (clientX: number, clientY: number): number => {
    const grid = gridRef.current;
    if (!grid) return images.length;
    const tiles = Array.from(grid.querySelectorAll<HTMLElement>("[data-tile]"));
    if (!tiles.length) return 0;
    let nearestIndex = 0;
    let before = true;
    let bestDist = Infinity;
    for (const el of tiles) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = (cx - clientX) ** 2 + (cy - clientY) ** 2;
      if (d < bestDist) {
        bestDist = d;
        nearestIndex = Number(el.dataset.tile);
        before = clientX < cx;
      }
    }
    return before ? nearestIndex : nearestIndex + 1;
  };

  // Is the pointer within (a little slack around) the gallery grid? Inside → reorder tiles;
  // outside → extract the tile into its own image block at a document position.
  const insideGallery = (x: number, y: number): boolean => {
    const g = gridRef.current?.getBoundingClientRect();
    if (!g) return true;
    const m = 28;
    return x >= g.left - m && x <= g.right + m && y >= g.top - m && y <= g.bottom + m;
  };

  // Pull tile `i` out of the gallery into its own single `image` block at `target`, then remove
  // it from the group (collapsing 2→1 as usual). Reuses the tile's saved url — no re-upload.
  const extractTile = (i: number, target: DropTarget) => {
    const img = images[i];
    if (!img) return;
    editor.insertBlocks(
      [{ type: "image", props: { url: img.url, caption: img.caption ?? "", width: DEFAULT_IMAGE_WIDTH } }],
      target.referenceId,
      target.placement,
    );
    log.info("media", "group.extract", { id: block.id, index: i, to: target.referenceId, placement: target.placement });
    remove(i);
  };

  const onGripDown = (i: number) => (e: PointerEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    setDragFrom(i);
    let docTarget: DropTarget | null = null;
    const onMove = (ev: globalThis.PointerEvent) => {
      if (insideGallery(ev.clientX, ev.clientY)) {
        docTarget = null;
        drawDocDrop(null, new Map(), docDropRef);
        setDropAt(insertionIndexAt(ev.clientX, ev.clientY));
      } else {
        // Dragged out of the gallery → preview a document drop for a standalone image.
        setDropAt(null);
        const { blocks, rects } = scanDocBlocks(gridRef.current);
        docTarget = computeDrop(blocks, ev.clientX, ev.clientY, new Set(), false);
        drawDocDrop(docTarget, rects, docDropRef);
      }
    };
    const finish = (ev: globalThis.PointerEvent, apply: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      drawDocDrop(null, new Map(), docDropRef);
      if (apply) {
        if (!insideGallery(ev.clientX, ev.clientY) && docTarget) {
          extractTile(i, docTarget);
        } else {
          const insertion = insertionIndexAt(ev.clientX, ev.clientY);
          const to = insertion > i ? insertion - 1 : insertion;
          if (to !== i && to >= 0 && to < images.length) {
            setImages(reorderImages(images, i, to));
            log.info("media", "group.reorder", { id: block.id, from: i, to });
          }
        }
      }
      setDragFrom(null);
      setDropAt(null);
    };
    const onUp = (ev: globalThis.PointerEvent) => finish(ev, true);
    const onCancel = (ev: globalThis.PointerEvent) => finish(ev, false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
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
      accept="image/*,audio/*"
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
                  <span>Add media</span>
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

  // One tile in the justified strip (its width comes from the packer; height = the shared row
  // height). Keeps every per-tile affordance from before: reorder grip, remove, lift-out, caption,
  // saving hairline, broken state, and the reorder insertion bar.
  const renderTile = (i: number, width: number) => {
    const img = images[i];
    return (
      <div
        key={`${i}-${img.url}`}
        data-tile={i}
        className={"pensieve-gallery-tile" + (dragFrom === i ? " is-dragging" : "") + (broken.has(i) ? " is-broken" : "")}
        style={{ width, height: packed.rowH }}
        tabIndex={0}
        onKeyDown={onTileKey(i)}
      >
        {dropAt === i && editable && <div className="pensieve-gallery-insert" aria-hidden />}
        {editable && dropAt === images.length && i === images.length - 1 && (
          <div className="pensieve-gallery-insert is-end" aria-hidden />
        )}
        {img.kind === "audio" ? (
          // A recording rides the strip as a compact waveform card (plays in place; its
          // transcript opens the split). playerKey is per-recording so two cards don't
          // share one playhead.
          <GalleryAudioTile url={img.url} playerKey={`${block.id}:${img.url}`} caption={img.caption} />
        ) : img.url && !broken.has(i) ? (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <img
            className="pensieve-gallery-img"
            src={img.url}
            alt={mediaAlt(img.caption)}
            draggable={false}
            onLoad={(e) => onTileLoad(img.url, e.currentTarget)}
            onError={() => markBroken(i)}
            onClick={(e) => expand(i, e.currentTarget.closest(".pensieve-gallery-tile") as HTMLElement)}
          />
        ) : (
          <div className="pensieve-gallery-brokentile">
            <span className="pensieve-media-filename">{imageFilename(img.url) || "image missing"}</span>
          </div>
        )}

        {img.saving && <div className="pensieve-media-progress" aria-hidden />}

        {editable && (
          <>
            <button type="button" className="pensieve-gallery-remove" title="Remove from gallery" aria-label="Remove image" onClick={() => remove(i)}>
              <X size={14} />
            </button>
            <div className="pensieve-gallery-grip" title="Drag to reorder (or out of the gallery)" aria-label="Reorder image" onPointerDown={onGripDown(i)}>
              <GripVertical size={14} />
            </div>
            {/* Audio cards are self-contained (their controls occupy the bottom row) — no
                caption input, which would collide with the controls. */}
            {img.kind !== "audio" && (
              <input
                className="pensieve-gallery-caption"
                value={img.caption ?? ""}
                placeholder="Caption…"
                onChange={(e) => setCaption(i, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              />
            )}
          </>
        )}
        {!editable && img.caption && img.kind !== "audio" && (
          <div className="pensieve-gallery-caption-static">{img.caption}</div>
        )}
      </div>
    );
  };

  return (
    <div className={"pensieve-gallery" + (dragOver ? " is-dragover" : "")} contentEditable={false} {...dropProps}>
      {/* Pinterest-style justified strip: a horizontal scroller of `rowCount` stacked rows, each
          `rowH` tall; images keep their ratios (width = aspect·rowH); the whole strip is as tall as
          the (draggable) gallery height. The "+" add button sits full-height at the right. */}
      <div ref={gridRef} className="pensieve-gallery-strip" style={{ height: containerHeight }}>
        <div className="pensieve-gallery-rows" style={{ gap: `${GALLERY_GAP}px` }}>
          {packed.rows.map((row, ri) => (
            <div
              key={ri}
              className="pensieve-gallery-row"
              style={{ height: packed.rowH, width: packed.contentWidth, gap: `${GALLERY_GAP}px` }}
            >
              {row.tiles.map((t) => renderTile(t.index, t.width))}
            </div>
          ))}
        </div>
        {editable && (
          <button
            type="button"
            className="pensieve-gallery-add"
            style={{ height: containerHeight }}
            title="Add media"
            aria-label="Add media"
            onClick={() => setPopover((p) => (p === "add" ? null : "add"))}
          >
            <Plus size={20} />
          </button>
        )}
      </div>
      {editable && (
        <div
          className="pensieve-gallery-height-handle"
          ref={heightHandleRef}
          title="Drag to resize the gallery"
          aria-label="Resize gallery height"
        />
      )}
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
      // The user-dragged display height (px) for the Pinterest-style justified strip; 0 = auto.
      // Round-trips via the fence's `h=` header (lib/md/gallery).
      height: { default: 0, type: "number" },
    },
  },
  {
    render: (props) => <GroupRender block={props.block as never} editor={props.editor as never} />,
  },
)();
