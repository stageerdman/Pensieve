import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  parseGalleryImages,
  stringifyGalleryImages,
  type GalleryImage,
} from "../../../../lib/md/gallery";
import { removeImageAt, reorderImages } from "../galleryModel";
import { justifyGallery } from "../galleryJustify";
import { useResizeHandle } from "../mediaResize";
import { computeDrop, type DropBlock, type DropTarget } from "../../blockDrag";
import { DEFAULT_IMAGE_WIDTH } from "../../../../lib/md/image";
import { getMediaNoteId } from "../mediaContext";
import { mergeFilesIntoBlock, type GroupEditor } from "../insertGroup";
import { lightbox } from "../../../media/lightboxController";
import { Wand, Images as ImagesIcon } from "../../../icons";
import { MediaLibrary } from "../MediaLibraryModal";
import { log } from "../../../../lib/logger";
import { GalleryRow } from "./GalleryRow";
import { type GalleryTileCallbacks } from "./GalleryTile";
import { useGalleryDrop } from "./useGalleryDrop";

// The inline gallery ORCHESTRATOR — several images/recordings grouped into ONE block. Owns
// the images↔block-prop state, the justified layout (justifyGallery), the dragged height,
// add/remove/reorder/caption, the add menu, and the file-drop (useGalleryDrop) + tile
// reorder/extract. It renders GalleryRow → GalleryTile → an image/audio element (a file per
// element). Pure geometry (galleryJustify) and the md bridge (lib/md/gallery) stay separate.

// Pinterest-style justified strip tuning.
const GALLERY_GAP = 4;
const TARGET_ROW_H = 220;
const MAX_ROWS = 4;
const DEFAULT_GALLERY_HEIGHT = 260;
const MIN_GALLERY_HEIGHT = 120;
const MAX_GALLERY_HEIGHT = 640;
const DEFAULT_ASPECT = 1.5; // optimistic landscape until an image reports its natural size
const AUDIO_ASPECT = 1.85; // audio cards ride the strip like a wide photo (fixed aspect)

// Scan the editor's block rows so a tile dragged OUT of the gallery can land at a document
// position — a lightweight mirror of useBlockDrag's scan.
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

// Draw/clear the body-level drop line for an out-of-gallery extraction.
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

export interface GalleryBlockEditor {
  isEditable: boolean;
  updateBlock: (id: string, update: unknown) => void;
  insertBlocks: (blocks: unknown[], ref: string, placement: "before" | "after") => Array<{ id: string }>;
}

interface Props {
  block: { id: string; props: { images: string; height?: number } };
  editor: GalleryBlockEditor;
}

export function Gallery({ block, editor }: Props) {
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
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docDropRef = useRef<HTMLDivElement | null>(null);

  const containerHeight = liveHeight ?? (Number(block.props.height) || DEFAULT_GALLERY_HEIGHT);
  const onTileLoad = (url: string, el: HTMLImageElement) => {
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    if (!w || !h) return;
    const ar = w / h;
    setAspects((prev) => (Math.abs((prev[url] ?? 0) - ar) < 1e-3 ? prev : { ...prev, [url]: ar }));
  };

  const packed = justifyGallery(
    // Audio tiles use a FIXED aspect (not aspect-measured); the packer treats it as any other
    // number, so they scale with the row height for free.
    images.map((img) => (img.kind === "audio" ? AUDIO_ASPECT : aspects[img.url] ?? DEFAULT_ASPECT)),
    { containerHeight, gap: GALLERY_GAP, targetRowH: TARGET_ROW_H, maxRows: MAX_ROWS },
  );

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
      editor.updateBlock(block.id, { props: { height: Math.round(last) } });
    };
    document.body.classList.add("pensieve-resizing");
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end);
  });

  useEffect(() => () => drawDocDrop(null, new Map(), docDropRef), []);

  // Safety net: never let the drop-highlight ring stick on after a drag ends anywhere.
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

  const expand = (i: number, rectEl?: HTMLElement | null) => {
    lightbox.open({
      items: images.map((img) => ({ url: img.url, caption: img.caption || undefined })),
      index: i,
      originRect: rectEl?.getBoundingClientRect(),
      originElement: rectEl ?? null,
    });
    log.info("media", "group.expand", { id: block.id, index: i });
  };

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
    setImages(images.map((img, j) => (j === i ? { ...img, caption } : img)));
  };

  const addFiles = (files: File[]) => {
    if (files.length) void mergeFilesIntoBlock(editor as unknown as GroupEditor, getMediaNoteId(), files, block.id);
  };

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

  // File drops: one owner, native capture-phase listeners on the gallery root.
  const galleryDropRef = useGalleryDrop({ enabled: editable, onFiles: addFiles, setDragOver, debugId: block.id });

  // ── pointer-based tile reorder / extract-out ──
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

  const insideGallery = (x: number, y: number): boolean => {
    const g = gridRef.current?.getBoundingClientRect();
    if (!g) return true;
    const m = 28;
    return x >= g.left - m && x <= g.right + m && y >= g.top - m && y <= g.bottom + m;
  };

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

  const cb: GalleryTileCallbacks = {
    onRemove: remove,
    onCaption: setCaption,
    onExpand: expand,
    onImageLoad: onTileLoad,
    onImageError: markBroken,
    onGripDown,
    onKeyDown: onTileKey,
  };

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
              <div className="pensieve-media-menu-hint">or drag &amp; drop images or recordings here</div>
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

  // Empty gallery (just inserted via /gallery) → a placeholder: click for the add menu, or
  // drop media here.
  if (images.length === 0) {
    return (
      <div className={"pensieve-gallery" + (dragOver ? " is-dragover" : "")} contentEditable={false} ref={galleryDropRef}>
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

  return (
    <div className={"pensieve-gallery" + (dragOver ? " is-dragover" : "")} contentEditable={false} ref={galleryDropRef}>
      {/* Justified strip: a horizontal scroller of stacked rows (gridRef for reorder hit-tests);
          the "+" add button sits full-height at the right. */}
      <div ref={gridRef} className="pensieve-gallery-strip" style={{ height: containerHeight }}>
        <div className="pensieve-gallery-rows" style={{ gap: `${GALLERY_GAP}px` }}>
          {packed.rows.map((row, ri) => (
            <GalleryRow
              key={ri}
              tiles={row.tiles.map((t) => ({ index: t.index, width: t.width }))}
              rowH={packed.rowH}
              contentWidth={packed.contentWidth}
              gap={GALLERY_GAP}
              images={images}
              editable={editable}
              blockId={block.id}
              dragFrom={dragFrom}
              dropAt={dropAt}
              broken={broken}
              cb={cb}
            />
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
            <Wand size={20} />
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
