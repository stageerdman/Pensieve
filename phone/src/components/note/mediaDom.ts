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
  mediaAlt,
  parseNoteContent,
  type MediaImage,
  type NoteBlock,
} from "../../lib/media/noteMedia";
import { cachedMediaUrl, resolveMediaUrl } from "../../lib/media/mediaStore";
import { phoneLightbox } from "../../lib/media/lightboxController";
import { phoneCollection } from "../../lib/media/collectionController";

export interface MediaCtx {
  /** fired after any media mutation so the app can schedule an autosave. */
  onChange: () => void;
}


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
  img.alt = mediaAlt(block.caption);
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

// ---- gallery block (Pinterest "saved collection": composite cover → full-screen masonry) ----

function buildGalleryEl(block: Extract<NoteBlock, { kind: "gallery" }>, ctx: MediaCtx, noteBody: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.className = "ph-media ph-gallery";
  el.contentEditable = "false";
  writeBlock(el, block);
  renderGallery(el, ctx, noteBody);
  return el;
}

/** (Re)build a gallery's visuals = a single composite COVER (a board thumbnail made of the first
 *  few photos). Tapping it opens the full-screen collection (all photos, vertical masonry). */
function renderGallery(el: HTMLElement, ctx: MediaCtx, noteBody: HTMLElement) {
  const block = readBlock(el);
  if (block?.kind !== "gallery") return;
  const images = block.images;
  el.innerHTML = "";

  const coverCount = Math.min(images.length, 3); // 1 big + up to 2 small
  const cover = document.createElement("button");
  cover.type = "button";
  cover.className = "ph-cover ph-cover-" + coverCount;
  cover.setAttribute("aria-label", `Open photo collection (${images.length} photos)`);

  for (let i = 0; i < coverCount; i++) {
    const cell = document.createElement("div");
    cell.className = "ph-cover-cell";
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    attachImg(img, images[i].ref);
    cell.appendChild(img);
    // "+N" on the last cover cell when the board has more than the cover shows.
    if (i === coverCount - 1 && images.length > coverCount) {
      const more = document.createElement("span");
      more.className = "ph-cover-more";
      more.textContent = "+" + (images.length - coverCount);
      cell.appendChild(more);
    }
    cover.appendChild(cell);
  }

  cover.addEventListener("click", () => {
    void resolveAll(readGalleryImages(el)).then((items) =>
      phoneCollection.open(items, {
        editable: true,
        onRemove: (index) => removeAt(el, index, ctx, noteBody),
        onReorder: (from, to) => reorderAt(el, from, to, ctx, noteBody),
        // The collection's "Photo" spell adds to THIS gallery (reuses saved refs), then returns
        // the refreshed resolved photos so the masonry updates in place.
        onAdd: async (images) => {
          mergeInto(el, images as MediaImage[], ctx, noteBody);
          return resolveAll(readGalleryImages(el));
        },
      }),
    );
  });
  el.appendChild(cover);
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

/** Move the image at `from` to `to` (order-preserving splice) and persist. Mirrors removeAt —
 *  the collection view calls this after a drag-reorder; desktop reads the new gallery order. */
function reorderAt(el: HTMLElement, from: number, to: number, ctx: MediaCtx, noteBody: HTMLElement) {
  const images = readGalleryImages(el);
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return;
  const next = images.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  setGalleryImages(el, next, ctx, noteBody);
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
  ensureTrailingTextRow(noteBody);
}

/** Notion-style: if the note's last block is media, append an empty editable text row so the
 *  caret has a place to land BELOW the images. serializeNoteBody trims it, so it never persists
 *  as content until the user actually types there. */
export function ensureTrailingTextRow(noteBody: HTMLElement): HTMLElement {
  const last = noteBody.lastElementChild as HTMLElement | null;
  if (last && !isMediaEl(last) && last.tagName !== "H1") return last;
  const div = document.createElement("div");
  div.innerHTML = "<br>";
  noteBody.appendChild(div);
  return div;
}

/** Tap below the last block (the big empty area under images) → ensure a trailing text row and
 *  drop the caret into it, so you can keep writing under media (like Notion). */
export function caretToTrailingRow(noteBody: HTMLElement) {
  const row = ensureTrailingTextRow(noteBody);
  const range = document.createRange();
  range.selectNodeContents(row);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  noteBody.focus();
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
      else if (b?.kind === "gallery") parts.push(galleryMd(b.images, b.height));
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
