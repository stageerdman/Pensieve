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
  encodeAudioNoteBlock,
  encodeImageNoteBlock,
  galleryMd,
  mediaAlt,
  parseNoteContent,
  type ListItemNode,
  type MediaImage,
  type NoteBlock,
} from "../../lib/media/noteMedia";
import { cachedMediaUrl, loadTranscript, resolveMediaUrl } from "../../lib/media/mediaStore";
import { phoneLightbox } from "../../lib/media/lightboxController";
import { phoneCollection } from "../../lib/media/collectionController";
import { fmtTime, getController } from "../../lib/media/audioController";
import { phoneTranscriptReader } from "../../lib/media/transcriptReaderController";

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

/** Drop focus off the contentEditable body so iOS dismisses the keyboard (used when opening the
 *  lightbox / collection from a tap on media that would otherwise re-focus the editable). */
function blurActive() {
  (document.activeElement as HTMLElement | null)?.blur?.();
}

/** A six-dot grip handle appended to every media block: the drag handle for reordering the block
 *  within the note (see installBlockDrag). Pressing the grip = drag; touching the photo = open. */
function appendGrip(el: HTMLElement) {
  const grip = document.createElement("div");
  grip.className = "ph-grip";
  grip.contentEditable = "false";
  grip.setAttribute("aria-label", "Drag to move");
  grip.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
    '<circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>' +
    '<circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>' +
    '<circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
  el.appendChild(grip);
}

/** Wire a "tap to open" on a media block WITHOUT the tap raising the on-screen keyboard.
 *
 *  Why this is more than a click handler: the block is `contentEditable=false` inside the
 *  contentEditable body. On iOS a tap that lands on it still focuses the body (places the caret
 *  at the nearest editable spot) and pops the keyboard — and iOS drives that from the TOUCH
 *  sequence, not the synthesized `mousedown`, so `mousedown.preventDefault()` alone doesn't stop
 *  it. The fix: on a genuine tap (touch released without scrolling) we `preventDefault()` the
 *  `touchend`, which suppresses BOTH the editable focus and the ghost click, then open ourselves.
 *  A scroll (finger moved past the threshold) is left untouched so the page still scrolls when the
 *  drag starts on a photo. Mouse/desktop falls through to `click`. */
const TAP_SLOP_PX = 10;
function wireMediaTap(el: HTMLElement, onTap: (clientX: number) => void) {
  let sx = 0;
  let sy = 0;
  let moved = false;
  let lastTouchTapAt = 0;

  el.addEventListener("mousedown", (e) => e.preventDefault()); // mouse: don't focus the editable
  el.addEventListener(
    "touchstart",
    (e) => {
      moved = false;
      const t = e.touches[0];
      sx = t ? t.clientX : 0;
      sy = t ? t.clientY : 0;
    },
    { passive: true },
  );
  el.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - sx) > TAP_SLOP_PX || Math.abs(t.clientY - sy) > TAP_SLOP_PX) moved = true;
    },
    { passive: true },
  );
  el.addEventListener(
    "touchend",
    (e) => {
      if (moved) return; // a scroll, not a tap — let the keyboard/scroll behave normally
      if (e.cancelable) e.preventDefault(); // stop iOS focusing the editable + the ghost click
      lastTouchTapAt = Date.now();
      blurActive();
      onTap(sx);
    },
    { passive: false },
  );
  el.addEventListener("click", (e) => {
    if (Date.now() - lastTouchTapAt < 700) return; // the touchend tap already handled this
    blurActive();
    onTap((e as MouseEvent).clientX);
  });
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
  // A desktop resize/crop rides the pensieve:image fence (width/aspect/posX/posY) — the phone
  // has no per-image resize UI, but it still HONOURS the desktop's sizing when displaying it.
  if (block.width !== undefined) fig.style.maxWidth = `${Math.round(block.width * 100)}%`;
  const img = document.createElement("img");
  img.alt = mediaAlt(block.caption);
  img.draggable = false;
  if (block.aspect && block.aspect > 0) {
    img.style.aspectRatio = String(block.aspect);
    img.style.objectFit = "cover";
    img.style.objectPosition = `${block.posX ?? 50}% ${block.posY ?? 50}%`;
  }
  attachImg(img, block.ref);
  fig.appendChild(img);
  if (block.caption) {
    const cap = document.createElement("figcaption");
    cap.textContent = block.caption;
    fig.appendChild(cap);
  }
  el.appendChild(fig);

  // Tap to open the lightbox — without the tap raising the keyboard (see wireMediaTap). Wired on
  // the whole .ph-media wrapper so a tap on the caption or the block's padding is covered too, not
  // just the <img>.
  wireMediaTap(el, () => {
    const b = readBlock(el);
    if (b?.kind !== "image") return;
    void resolveAll([{ ref: b.ref, caption: b.caption }]).then((items) => phoneLightbox.open(items, 0));
  });
  appendGrip(el);
  void ctx; // image block has no in-place mutation (remove/caption handled at gallery level)
  return el;
}

// ---- voice recording block ----
//
// Reuses the desktop AudioBar's visual language (play/pause, progress, time, a transcript
// icon) in a quieter phone-sized bar — no waveform/menu/record, which are desktop-only (phone
// capture is a separate future update). The transcript icon is absent until a sidecar resolves
// present; tapping it hands off to the full-screen reader (transcriptReaderController), which
// shares THIS block's playback controller by ref so the audio never restarts or duplicates.

const PLAY_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a.75.75 0 0 0 1.14.64l10.5-6.5a.75.75 0 0 0 0-1.28L9.14 4.86A.75.75 0 0 0 8 5.5Z"/></svg>';
const PAUSE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/></svg>';
const TRANSCRIPT_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6h14"/><path d="M5 10h10"/><path d="M5 14h14"/><path d="M5 18h8"/></svg>';

function buildAudioEl(block: Extract<NoteBlock, { kind: "audio" }>, ctx: MediaCtx): HTMLElement {
  const el = document.createElement("div");
  el.className = "ph-media ph-audio";
  el.contentEditable = "false";
  writeBlock(el, block);
  void ctx; // no in-place mutation yet (remove/replace are a future fast-follow, like images)

  const bar = document.createElement("div");
  bar.className = "ph-audio-bar";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "ph-audio-play";
  playBtn.setAttribute("aria-label", "Play");
  playBtn.innerHTML = PLAY_SVG;

  const track = document.createElement("div");
  track.className = "ph-audio-track";
  const fill = document.createElement("div");
  fill.className = "ph-audio-fill";
  track.appendChild(fill);

  const time = document.createElement("span");
  time.className = "ph-audio-time";
  time.textContent = "0:00 / 0:00";

  const transcriptBtn = document.createElement("button");
  transcriptBtn.type = "button";
  transcriptBtn.className = "ph-audio-transcript";
  transcriptBtn.setAttribute("aria-label", "Transcript");
  transcriptBtn.innerHTML = TRANSCRIPT_SVG;
  transcriptBtn.hidden = true; // shown only once a sidecar resolves present

  bar.append(playBtn, track, time, transcriptBtn);
  el.appendChild(bar);
  if (block.caption) {
    const cap = document.createElement("div");
    cap.className = "ph-audio-caption";
    cap.textContent = block.caption;
    el.appendChild(cap);
  }
  appendGrip(el);

  const ref = block.ref;
  void resolveMediaUrl(ref).then((url) => {
    if (!url) {
      el.classList.add("is-broken");
      bar.innerHTML = "";
      const broken = document.createElement("span");
      broken.className = "ph-audio-broken";
      broken.textContent = "Recording missing";
      bar.appendChild(broken);
      return;
    }
    const c = getController(ref, url);
    const render = () => {
      playBtn.innerHTML = c.playing ? PAUSE_SVG : PLAY_SVG;
      playBtn.setAttribute("aria-label", c.playing ? "Pause" : "Play");
      const dur = c.duration;
      const frac = Number.isFinite(dur) && dur > 0 ? c.currentTime / dur : 0;
      fill.style.width = `${Math.min(1, Math.max(0, frac)) * 100}%`;
      time.textContent = `${fmtTime(c.currentTime)} / ${fmtTime(dur)}`;
    };
    render();
    c.on("play", render);
    c.on("pause", render);
    c.on("time", render);
    c.on("durationchange", render);

    wireMediaTap(playBtn, () => c.toggle());
    wireMediaTap(track, (clientX) => {
      const r = track.getBoundingClientRect();
      c.seekFrac(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
    });

    void loadTranscript(ref).then((t) => {
      if (!t) return;
      transcriptBtn.hidden = false;
      wireMediaTap(transcriptBtn, () => {
        phoneTranscriptReader.open({ ref, src: url, transcript: t, caption: block.caption });
      });
    });
  });

  return el;
}

// ---- gallery block (Pinterest "saved collection": composite cover → full-screen masonry) ----

function buildGalleryEl(block: Extract<NoteBlock, { kind: "gallery" }>, ctx: MediaCtx, noteBody: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.className = "ph-media ph-gallery";
  el.contentEditable = "false";
  writeBlock(el, block);
  renderGallery(el);
  // Tap the cover to open the full-screen board — without raising the keyboard. Wired on the
  // stable wrapper ONCE (renderGallery rebuilds the cover on every mutation, so wiring there
  // would stack duplicate listeners).
  wireMediaTap(el, () => openCollection(el, ctx, noteBody));
  return el;
}

/** Open the full-screen Pinterest board for a gallery block (all photos, editable). */
function openCollection(el: HTMLElement, ctx: MediaCtx, noteBody: HTMLElement) {
  void resolveAll(readGalleryImages(el)).then((items) =>
    phoneCollection.open(items, {
      editable: true,
      onRemove: (index) => removeAt(el, index, ctx),
      onReorder: (from, to) => reorderAt(el, from, to, ctx),
      onPullOut: (index) => pullOutAt(el, index, ctx),
      // The collection's "Photo" spell adds to THIS gallery (reuses saved refs), then returns
      // the refreshed resolved photos so the masonry updates in place.
      onAdd: async (images) => {
        mergeInto(el, images as MediaImage[], ctx, noteBody);
        return resolveAll(readGalleryImages(el));
      },
    }),
  );
}

/** (Re)build a gallery's visuals = a single composite COVER (a board thumbnail made of the first
 *  few photos). The tap-to-open is wired once on the wrapper in buildGalleryEl, not here. */
function renderGallery(el: HTMLElement) {
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

  el.appendChild(cover);
  appendGrip(el); // re-added after every rebuild (innerHTML was cleared above)
}

function readGalleryImages(el: HTMLElement): MediaImage[] {
  const b = readBlock(el);
  return b?.kind === "gallery" ? b.images : [];
}

function setGalleryImages(el: HTMLElement, images: MediaImage[], ctx: MediaCtx) {
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
  renderGallery(el);
  ctx.onChange();
}

function removeAt(el: HTMLElement, index: number, ctx: MediaCtx) {
  const images = readGalleryImages(el);
  if (!images.length) return;
  const next = images.filter((_, i) => i !== index);
  haptic(8);
  setGalleryImages(el, next, ctx);
}

/** Move the image at `from` to `to` (order-preserving splice) and persist. Mirrors removeAt —
 *  the collection view calls this after a drag-reorder; desktop reads the new gallery order. */
function reorderAt(el: HTMLElement, from: number, to: number, ctx: MediaCtx) {
  const images = readGalleryImages(el);
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return;
  const next = images.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  setGalleryImages(el, next, ctx);
}

/** Pull the image at `index` OUT of the gallery into the note: it becomes a standalone image block
 *  placed directly AFTER the gallery, and leaves the gallery. Insert the new block FIRST (while the
 *  gallery element is still in place as the anchor), then drop it from the gallery — if that
 *  collapses the gallery to a single image/empty, the pulled block still sits right after it. */
function pullOutAt(el: HTMLElement, index: number, ctx: MediaCtx) {
  const images = readGalleryImages(el);
  if (index < 0 || index >= images.length) return;
  const pulled = images[index];
  const single = buildImageEl({ kind: "image", ref: pulled.ref, ...(pulled.caption ? { caption: pulled.caption } : {}) }, ctx);
  el.after(single); // land it under the gallery
  haptic(12);
  setGalleryImages(el, images.filter((_, i) => i !== index), ctx); // drop from the gallery + persist
}

// ---- markdown list rendering (bullet / numbered / checklist) ----
//
// The DOM <ul>/<ol>/<li> tree IS the model here (unlike media, which needs a data-media
// payload because refs aren't visible in the DOM) — nesting = actual nested lists, ordered =
// tag name, a checklist item carries `data-checked` on its <li>. That also means a list the
// user builds with the toolbar's native `execCommand("insertUnorderedList")` serializes the
// same way as one loaded from markdown, with no extra bookkeeping.

/** Build a `<ul>`/`<ol>` from a sibling run of list items (recursing into children). The
 *  group's tag follows its first item — markdown doesn't really support mixing ordered/
 *  unordered at the same level, so this matches what was actually written. */
function buildListGroup(items: ListItemNode[]): HTMLElement {
  const ordered = items[0]?.ordered ?? false;
  const listEl = document.createElement(ordered ? "ol" : "ul");
  listEl.className = "ph-list";
  for (const n of items) {
    const li = document.createElement("li");
    if (n.checked !== undefined) {
      li.classList.add("ph-check-item");
      li.dataset.checked = n.checked ? "true" : "false";
      const mark = document.createElement("span");
      mark.className = "ph-check-mark";
      mark.contentEditable = "false";
      mark.setAttribute("aria-hidden", "true");
      li.appendChild(mark);
    }
    li.appendChild(document.createTextNode(n.text || ""));
    if (n.children.length) li.appendChild(buildListGroup(n.children));
    listEl.appendChild(li);
  }
  return listEl;
}

/** A `<li>`'s own text, excluding its nested sub-list and checklist glyph. */
function liOwnText(li: HTMLElement): string {
  const clone = li.cloneNode(true) as HTMLElement;
  Array.from(clone.children).forEach((c) => {
    const child = c as HTMLElement;
    if (child.tagName === "UL" || child.tagName === "OL" || child.classList.contains("ph-check-mark")) child.remove();
  });
  return (clone.textContent || "").trim();
}

/** Serialize a `<ul>`/`<ol>` (and its nested sub-lists) → markdown list lines. Generic over
 *  ANY such element, so a list the user built via the toolbar's native list command
 *  serializes identically to one we rendered from markdown. */
function serializeListEl(listEl: HTMLElement, depth = 0): string[] {
  const ordered = listEl.tagName === "OL";
  const out: string[] = [];
  let idx = 0;
  for (const child of Array.from(listEl.children)) {
    const li = child as HTMLElement;
    if (li.tagName !== "LI") continue;
    idx++;
    const indent = "  ".repeat(depth);
    const marker = li.dataset.checked !== undefined ? `* [${li.dataset.checked === "true" ? "x" : " "}] ` : ordered ? `${idx}. ` : "* ";
    out.push(indent + marker + liOwnText(li));
    const nested = (Array.from(li.children) as HTMLElement[]).find((c) => c.tagName === "UL" || c.tagName === "OL");
    if (nested) out.push(...serializeListEl(nested, depth + 1));
  }
  return out;
}

// ---- body render + serialize ----

function buildBlockEl(block: NoteBlock, ctx: MediaCtx, noteBody: HTMLElement): HTMLElement {
  if (block.kind === "image") return buildImageEl(block, ctx);
  if (block.kind === "gallery") return buildGalleryEl(block, ctx, noteBody);
  if (block.kind === "list") return buildListGroup(block.items);
  if (block.kind === "audio") return buildAudioEl(block, ctx);
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
  installBlockDrag(noteBody, ctx); // once per body; handlers survive this rebuild
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
      if (b?.kind === "image") parts.push(encodeImageNoteBlock(b));
      else if (b?.kind === "gallery") parts.push(galleryMd(b.images, b.height));
      else if (b?.kind === "audio") parts.push(encodeAudioNoteBlock(b));
    } else if (el.tagName === "UL" || el.tagName === "OL") {
      parts.push(serializeListEl(el).join("\n"));
    } else {
      parts.push(el.textContent || "");
    }
  }
  return { title, content: parts.join("\n").trim() };
}

// ---- insert (from the picker) ----

/** Insert freshly picked images into the body. Merges into an adjacent media block to form
 *  a gallery (emergent gallery), else drops a new single/gallery block at the caret.
 *  `opts.newBlock` forces a fresh, separate block (the "Gallery" spell: an explicit new gallery)
 *  — it skips the adjacency merge so the picked photos never fold into a neighbouring block. */
export function insertImages(noteBody: HTMLElement, images: MediaImage[], ctx: MediaCtx, opts?: { newBlock?: boolean }) {
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

  if (!opts?.newBlock) {
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

/** Patch a freshly finalized recording straight into the live note body — used when the
 *  Record spell's engine (voiceCapture.ts) finishes while this exact note is open. The vault
 *  write already happened (finalize mutates `Note.c` directly), so this is DISPLAY-only: no
 *  `ctx.onChange()` here, or the next debounced autosave would re-serialize the DOM right back
 *  on top of a note that's already correct, for no benefit. Always appends at the end — a
 *  recording isn't tied to wherever the caret happened to be. */
export function insertAudio(noteBody: HTMLElement, block: Extract<NoteBlock, { kind: "audio" }>, ctx: MediaCtx) {
  const el = buildAudioEl(block, ctx);
  noteBody.appendChild(el);
  ensureTrailingTextRow(noteBody);
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
  renderGallery(mediaEl);
  ctx.onChange();
}

// ---- block drag (reorder a media block in the note; drop onto a gallery/image to merge) ----

function readImagesOf(el: HTMLElement): MediaImage[] {
  const b = readBlock(el);
  if (b?.kind === "image") return [{ ref: b.ref, ...(b.caption ? { caption: b.caption } : {}) }];
  if (b?.kind === "gallery") return b.images;
  return [];
}

/** Commit a block drag: REORDER (move the DOM node before/after the target top-level block) or
 *  MERGE (fold the dragged image into the target media block — image→gallery adds, image→image
 *  promotes to a gallery — then drop the now-empty dragged block). serializeNoteBody reads child
 *  order + payloads, so a DOM move / mergeInto + onChange is all that persists. */
export function commitMove(el: HTMLElement, target: HTMLElement, mode: "before" | "after" | "merge", ctx: MediaCtx, noteBody: HTMLElement) {
  if (el === target) return;
  if (mode === "merge") {
    const imgs = readImagesOf(el);
    if (!imgs.length) return;
    mergeInto(target, imgs, ctx, noteBody);
    el.remove();
    ctx.onChange();
    return;
  }
  if (mode === "before") noteBody.insertBefore(el, target);
  else noteBody.insertBefore(el, target.nextSibling);
  ensureTrailingTextRow(noteBody);
  ctx.onChange();
}

/** Wire note-body block dragging ONCE (handlers survive innerHTML rebuilds; `ctx` is a stable ref
 *  object so a first-install closure always calls the latest onChange). The drag is started from a
 *  block's grip (appendGrip) and lifts instantly — same ghost-clone engine as the gallery board
 *  (pointer-capture on the scroller, elementFromPoint hit-test under a pointer-events:none ghost,
 *  edge auto-scroll), no long-press timer. 3-zone hit-test: top/bottom half → reorder in the gap;
 *  middle of a media block (while dragging an image) → merge. */
export function installBlockDrag(noteBody: HTMLElement, ctx: MediaCtx) {
  if (noteBody.dataset.blockDrag === "1") return;
  noteBody.dataset.blockDrag = "1";
  const scroller = (noteBody.closest(".note-surface") as HTMLElement | null) ?? noteBody;

  let st: {
    el: HTMLElement;
    ghost: HTMLElement;
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    target: HTMLElement | null;
    mode: "before" | "after" | "merge" | null;
    raf: number;
  } | null = null;

  const clearMarks = () =>
    noteBody
      .querySelectorAll(".drop-before,.drop-after,.drop-merge")
      .forEach((n) => n.classList.remove("drop-before", "drop-after", "drop-merge"));

  // The top-level note block under a viewport point (walk up to a direct child of the body).
  const topBlockAt = (x: number, y: number): HTMLElement | null => {
    let n = document.elementFromPoint(x, y) as HTMLElement | null;
    while (n && n.parentElement !== noteBody) n = n.parentElement;
    return n && n.parentElement === noteBody ? n : null;
  };

  const hitTest = (x: number, y: number) => {
    if (!st) return;
    clearMarks();
    st.target = null;
    st.mode = null;
    const block = topBlockAt(x, y);
    if (!block || block === st.el) return;
    const r = block.getBoundingClientRect();
    const rel = r.height ? (y - r.top) / r.height : 0.5;
    const draggingImage = readBlock(st.el)?.kind === "image";
    // Middle of a media block while dragging an image → MERGE into it.
    if (draggingImage && isMediaEl(block) && rel > 0.3 && rel < 0.7) {
      block.classList.add("drop-merge");
      st.target = block;
      st.mode = "merge";
      return;
    }
    // Else REORDER: top half = drop before, bottom half = drop after. Never before the H1 title.
    const before = rel < 0.5 && block.tagName !== "H1";
    block.classList.add(before ? "drop-before" : "drop-after");
    st.target = block;
    st.mode = before ? "before" : "after";
  };

  const EDGE = 64;
  const VMAX = 12;
  const edgeStep = () => {
    if (!st) return;
    const r = scroller.getBoundingClientRect();
    const y = st.lastY;
    let v = 0;
    if (y < r.top + EDGE) v = -VMAX * (1 - (y - r.top) / EDGE);
    else if (y > r.bottom - EDGE) v = VMAX * (1 - (r.bottom - y) / EDGE);
    if (v !== 0) {
      scroller.scrollTop += v;
      hitTest(st.lastX, st.lastY); // re-resolve the target as content scrolls under a still finger
    }
    st.raf = requestAnimationFrame(edgeStep);
  };

  const begin = (el: HTMLElement, e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add("ph-block-ghost");
    ghost.querySelectorAll(".ph-grip").forEach((g) => g.remove());
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    document.body.appendChild(ghost);
    el.classList.add("ph-dragging");
    scroller.classList.add("ph-reordering");
    st = { el, ghost, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, target: null, mode: null, raf: 0 };
    try {
      scroller.setPointerCapture(e.pointerId);
    } catch {
      /* capture may be unavailable */
    }
    haptic(14);
    st.raf = requestAnimationFrame(edgeStep);
  };

  const end = (commit: boolean) => {
    if (!st) return;
    const s = st;
    st = null;
    if (s.raf) cancelAnimationFrame(s.raf);
    try {
      scroller.releasePointerCapture(s.pointerId);
    } catch {
      /* already released */
    }
    s.ghost.remove();
    s.el.classList.remove("ph-dragging");
    scroller.classList.remove("ph-reordering");
    clearMarks();
    if (commit && s.target && s.mode) commitMove(s.el, s.target, s.mode, ctx, noteBody);
  };

  noteBody.addEventListener("pointerdown", (e) => {
    const grip = (e.target as HTMLElement).closest?.(".ph-grip") as HTMLElement | null;
    if (!grip) return;
    const el = grip.closest(".ph-media") as HTMLElement | null;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation(); // the grip owns this gesture — no caret / selection / scroll
    begin(el, e);
  });
  scroller.addEventListener("pointermove", (e) => {
    if (!st || e.pointerId !== st.pointerId) return;
    e.preventDefault();
    st.lastX = e.clientX;
    st.lastY = e.clientY;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    st.ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.02)`;
    hitTest(e.clientX, e.clientY);
  });
  scroller.addEventListener("pointerup", () => end(true));
  scroller.addEventListener("pointercancel", () => end(false));
  // iOS: React/passive listeners can't block scroll — a stable non-passive guard preventDefaults
  // native panning only while a block is actually lifted.
  scroller.addEventListener("touchmove", (e) => { if (st) e.preventDefault(); }, { passive: false });
}
