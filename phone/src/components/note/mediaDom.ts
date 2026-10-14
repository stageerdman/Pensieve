// mediaDom.ts — imperative builders for media blocks inside the uncontrolled note body.
//
// HARD constraint (NoteBody): the contentEditable is uncontrolled — React never re-renders
// its children. So media blocks are plain DOM elements, built and mutated HERE on the ref,
// never via React. Each block is `contentEditable=false` (the caret can't land inside it)
// and carries its serialized payload in `data-media` (JSON), so serializeNoteBody can turn
// the body back into the SAME markdown model the desktop reads without touching pixels.
//
//   single image  →  <div class="ph-media ph-image" data-media='{"kind":"image",...}'>
//   gallery       →  <div class="ph-media ph-gallery" data-media='{"kind":"gallery",...}'>
//
// The visual DOM (imgs / carousel / dots) is DERIVED from the payload; a mutation (remove,
// reorder, merge) updates the payload + rebuilds visuals + calls ctx.onChange() so autosave
// serializes the new body.

import { esc, haptic } from "../../util";
import {
  collapseImages,
  galleryMd,
  imageMd,
  parseNoteContent,
  reorderImages,
  type MediaImage,
  type NoteBlock,
} from "../../lib/media/noteMedia";
import { cachedMediaUrl, resolveMediaUrl } from "../../lib/media/mediaStore";
import { phoneLightbox } from "../../lib/media/lightboxController";

export interface MediaCtx {
  /** fired after any media mutation so the app can schedule an autosave. */
  onChange: () => void;
}

const LONG_PRESS_MS = 460;

// ---- payload read/write ----

function readBlock(el: HTMLElement): NoteBlock | null {
  try {
    const raw = el.dataset.media;
    if (!raw) return null;
    const b = JSON.parse(raw) as NoteBlock;
    return b;
  } catch {
    return null;
  }
}

function writeBlock(el: HTMLElement, block: NoteBlock) {
  el.dataset.media = JSON.stringify(block);
}

/** True for a top-level media block element. (Plain boolean — NOT a type predicate, so
 *  negating it doesn't narrow the operand to `never`.) */
export function isMediaEl(node: Node | null): boolean {
  return !!node && node instanceof HTMLElement && node.classList.contains("ph-media");
}

// ---- image loading ----

function attachImg(img: HTMLImageElement, ref: string) {
  const cached = cachedMediaUrl(ref);
  if (cached) {
    img.src = cached;
    return;
  }
  img.classList.add("loading");
  void resolveMediaUrl(ref).then((url) => {
    if (url) {
      img.src = url;
      img.classList.remove("loading");
    } else {
      img.classList.remove("loading");
      img.classList.add("missing");
    }
  });
}

async function resolveAll(images: MediaImage[]): Promise<{ url: string; caption?: string }[]> {
  return Promise.all(
    images.map(async (im) => ({ url: (await resolveMediaUrl(im.ref)) ?? im.ref, ...(im.caption ? { caption: im.caption } : {}) })),
  );
}

// ---- single image block ----

function buildImageEl(block: Extract<NoteBlock, { kind: "image" }>, ctx: MediaCtx): HTMLElement {
  const el = document.createElement("div");
  el.className = "ph-media ph-image";
  el.contentEditable = "false";
  writeBlock(el, block);

  const fig = document.createElement("figure");
  const img = document.createElement("img");
  img.alt = block.caption ?? "";
  img.draggable = false;
  attachImg(img, block.ref);
  fig.appendChild(img);
  if (block.caption) {
    const cap = document.createElement("figcaption");
    cap.textContent = block.caption;
    fig.appendChild(cap);
  }
  el.appendChild(fig);

  img.addEventListener("click", () => {
    const b = readBlock(el);
    if (b?.kind !== "image") return;
    void resolveAll([{ ref: b.ref, caption: b.caption }]).then((items) => phoneLightbox.open(items, 0));
  });
  void ctx; // image block has no in-place mutation (remove/caption handled at gallery level)
  return el;
}

// ---- gallery block (carousel + dots + long-press edit) ----

function buildGalleryEl(block: Extract<NoteBlock, { kind: "gallery" }>, ctx: MediaCtx, noteBody: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.className = "ph-media ph-gallery";
  el.contentEditable = "false";
  writeBlock(el, block);
  renderGallery(el, ctx, noteBody);
  wireLongPress(el, ctx, noteBody); // once per element (renderGallery only rebuilds inner DOM)
  return el;
}

/** (Re)build a gallery element's visuals from its payload. */
function renderGallery(el: HTMLElement, ctx: MediaCtx, noteBody: HTMLElement) {
  const block = readBlock(el);
  if (block?.kind !== "gallery") return;
  const images = block.images;
  el.innerHTML = "";

  const track = document.createElement("div");
  track.className = "ph-gallery-track";
  images.forEach((im, i) => {
    const frame = document.createElement("div");
    frame.className = "ph-frame";
    frame.dataset.index = String(i);
    const img = document.createElement("img");
    img.alt = im.caption ?? "";
    img.draggable = false;
    attachImg(img, im.ref);
    frame.appendChild(img);

    // a quiet Remove, revealed in edit mode
    const rm = document.createElement("button");
    rm.className = "ph-frame-remove";
    rm.setAttribute("aria-label", "Remove image");
    rm.textContent = "×";
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      removeAt(el, i, ctx, noteBody);
    });
    frame.appendChild(rm);

    frame.addEventListener("click", () => {
      if (el.classList.contains("editing")) return; // taps edit tiles, not the lightbox
      void resolveAll(readGalleryImages(el)).then((items) => phoneLightbox.open(items, i));
    });
    track.appendChild(frame);
  });
  el.appendChild(track);

  const dots = document.createElement("div");
  dots.className = "ph-dots";
  dots.setAttribute("aria-hidden", "true");
  images.forEach((_, i) => {
    const d = document.createElement("span");
    if (i === 0) d.className = "on";
    dots.appendChild(d);
  });
  el.appendChild(dots);

  track.addEventListener("scroll", () => {
    if (!track.clientWidth) return;
    const idx = Math.round(track.scrollLeft / track.clientWidth);
    dots.querySelectorAll("span").forEach((s, i) => s.classList.toggle("on", i === idx));
  });
}

function readGalleryImages(el: HTMLElement): MediaImage[] {
  const b = readBlock(el);
  return b?.kind === "gallery" ? b.images : [];
}

function setGalleryImages(el: HTMLElement, images: MediaImage[], ctx: MediaCtx, noteBody: HTMLElement) {
  const collapsed = collapseImages(images);
  if (!collapsed) {
    el.remove(); // nothing left
    ctx.onChange();
    return;
  }
  if (collapsed.kind === "image") {
    // drop to a single image block (same as desktop 2->1 collapse)
    const single = buildImageEl(collapsed, ctx);
    el.replaceWith(single);
    ctx.onChange();
    return;
  }
  writeBlock(el, collapsed);
  renderGallery(el, ctx, noteBody);
  ctx.onChange();
}

function removeAt(el: HTMLElement, index: number, ctx: MediaCtx, noteBody: HTMLElement) {
  const images = readGalleryImages(el);
  if (!images.length) return;
  const next = images.filter((_, i) => i !== index);
  haptic(8);
  setGalleryImages(el, next, ctx, noteBody);
}

/** Long-press a gallery → edit mode (quiet Remove per tile + drag-to-reorder). Tap the
 *  body / wait exits. Haptic on lift into edit mode. */
function wireLongPress(el: HTMLElement, ctx: MediaCtx, noteBody: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  el.addEventListener("pointerdown", (e) => {
    if (el.classList.contains("editing")) {
      startReorder(el, e as PointerEvent, ctx, noteBody);
      return;
    }
    clear();
    timer = setTimeout(() => {
      el.classList.add("editing");
      haptic(16);
    }, LONG_PRESS_MS);
  });
  el.addEventListener("pointermove", clear);
  el.addEventListener("pointerup", clear);
  el.addEventListener("pointercancel", clear);
  // exit edit mode when the body is tapped elsewhere
  const exit = (ev: Event) => {
    if (!el.contains(ev.target as Node)) el.classList.remove("editing");
  };
  noteBody.addEventListener("pointerdown", exit);
}

/** Drag-reorder within edit mode: follow the finger, reorder on crossing a tile midpoint,
 *  commit on release. (Device-verified; jsdom has no layout so this is inert in tests.) */
function startReorder(el: HTMLElement, e: PointerEvent, ctx: MediaCtx, noteBody: HTMLElement) {
  const startFrame = (e.target as HTMLElement).closest<HTMLElement>(".ph-frame");
  if (!startFrame) return;
  let from = Number(startFrame.dataset.index);
  const track = el.querySelector<HTMLElement>(".ph-gallery-track");
  if (!track || Number.isNaN(from)) return;
  startFrame.classList.add("dragging");
  haptic(10);

  const move = (ev: PointerEvent) => {
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>(".ph-frame");
    if (!target || target === startFrame) return;
    const to = Number(target.dataset.index);
    if (Number.isNaN(to) || to === from) return;
    const imgs = reorderImages(readGalleryImages(el), from, to);
    writeBlock(el, { kind: "gallery", images: imgs });
    renderGallery(el, ctx, noteBody);
    el.classList.add("editing");
    from = to;
    const nf = track.querySelector<HTMLElement>(`.ph-frame[data-index="${to}"]`);
    nf?.classList.add("dragging");
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    el.querySelectorAll(".ph-frame.dragging").forEach((f) => f.classList.remove("dragging"));
    ctx.onChange();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

// ---- body render + serialize ----

function buildBlockEl(block: NoteBlock, ctx: MediaCtx, noteBody: HTMLElement): HTMLElement {
  if (block.kind === "image") return buildImageEl(block, ctx);
  if (block.kind === "gallery") return buildGalleryEl(block, ctx, noteBody);
  // text
  const div = document.createElement("div");
  div.innerHTML = block.text.trim() ? esc(block.text) : "<br>";
  return div;
}

/** Build the whole note body DOM from a Note's title + content (replaces the inline
 *  innerHTML build in openNote so media blocks render as elements, not raw text). */
export function renderNoteBody(noteBody: HTMLElement, title: string, content: string, ctx: MediaCtx) {
  noteBody.innerHTML = "";
  const h = document.createElement("h1");
  h.innerHTML = title ? esc(title) : "<br>";
  noteBody.appendChild(h);
  for (const block of parseNoteContent(content)) {
    noteBody.appendChild(buildBlockEl(block, ctx, noteBody));
  }
}

/** Serialize the note body DOM → { title, content } in the shared markdown model. Media
 *  blocks emit their `data-media` payload as markdown; everything else is its text. */
export function serializeNoteBody(noteBody: HTMLElement): { title: string; content: string } {
  const children = Array.from(noteBody.children) as HTMLElement[];
  let title = "";
  let start = 0;
  if (children[0] && children[0].tagName === "H1") {
    title = children[0].textContent?.trim() ?? "";
    start = 1;
  }
  const parts: string[] = [];
  for (let i = start; i < children.length; i++) {
    const el = children[i];
    if (isMediaEl(el)) {
      const b = readBlock(el);
      if (b?.kind === "image") parts.push(imageMd(b.ref, b.caption));
      else if (b?.kind === "gallery") parts.push(galleryMd(b.images));
    } else {
      parts.push(el.textContent || "");
    }
  }
  return { title, content: parts.join("\n").trim() };
}

// ---- insert (from the picker) ----

/** Insert freshly picked images into the body. Merges into an adjacent media block to form
 *  a gallery (emergent gallery), else drops a new single/gallery block at the caret. */
export function insertImages(noteBody: HTMLElement, images: MediaImage[], ctx: MediaCtx) {
  if (!images.length) return;

  // Find the caret's top-level block (or null → append at the end).
  let anchor: HTMLElement | null = null;
  const sel = window.getSelection();
  let n: Node | null = sel && sel.rangeCount ? sel.anchorNode : null;
  if (n) {
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n.parentNode !== noteBody) n = n.parentNode;
    if (n && n.parentNode === noteBody) anchor = n as HTMLElement;
  }

  const isBlank = (el: HTMLElement | null) => !!el && !isMediaEl(el) && !(el.textContent || "").trim();

  // 1) anchor IS a media block → merge into it.
  if (anchor && isMediaEl(anchor)) {
    mergeInto(anchor, images, ctx, noteBody);
    return;
  }
  // 2) blank caret line with a media block directly before/after → merge into that.
  if (isBlank(anchor)) {
    const prev = anchor!.previousElementSibling as HTMLElement | null;
    const next = anchor!.nextElementSibling as HTMLElement | null;
    if (isMediaEl(prev)) {
      mergeInto(prev!, images, ctx, noteBody);
      return;
    }
    if (isMediaEl(next)) {
      mergeInto(next!, images, ctx, noteBody);
      return;
    }
  }

  // 3) fresh block at the caret (or appended).
  const block = collapseImages(images);
  if (!block) return;
  const el = buildBlockEl(block, ctx, noteBody);
  if (anchor) anchor.after(el);
  else noteBody.appendChild(el);

  // ensure an editable line follows so typing can continue below the media
  let after = el.nextElementSibling as HTMLElement | null;
  if (!after || isMediaEl(after)) {
    const div = document.createElement("div");
    div.innerHTML = "<br>";
    el.after(div);
    after = div;
  }
  ctx.onChange();
}

function mergeInto(mediaEl: HTMLElement, add: MediaImage[], ctx: MediaCtx, noteBody: HTMLElement) {
  const existing = readBlock(mediaEl);
  if (!existing) return;
  const current: MediaImage[] =
    existing.kind === "image" ? [{ ref: existing.ref, ...(existing.caption ? { caption: existing.caption } : {}) }] : existing.kind === "gallery" ? existing.images : [];
  const merged = [...current, ...add];
  if (existing.kind === "image") {
    // promote single → gallery (replace the element type)
    const gal = buildGalleryEl({ kind: "gallery", images: merged }, ctx, noteBody);
    mediaEl.replaceWith(gal);
    ctx.onChange();
    return;
  }
  writeBlock(mediaEl, { kind: "gallery", images: merged });
  renderGallery(mediaEl, ctx, noteBody);
  ctx.onChange();
}
