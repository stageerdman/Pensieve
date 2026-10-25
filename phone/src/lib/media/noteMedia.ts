// noteMedia.ts — the phone's media <-> markdown bridge (PURE, no DOM, no IndexedDB).
//
// The phone has no real vault and no block editor; a note's body is one plain-text string
// (`Note.c`, newline-joined). Images must still ride the SAME markdown model the desktop
// produces so they are forward-compatible the day PWA-CAPTURE / real sync lands:
//
//   • single image  →  `![caption](media/<noteId>/<mediaId>.<ext>)` on its own line
//   • gallery        →  a `pensieve:gallery` fenced block, one `ref | caption` line per
//                        image, order = line order (identical to desktop lib/md/gallery.ts)
//
// This module parses `Note.c` into a block list and serializes a block list back, so the
// same text a desktop authored renders as images here, and images authored here round-trip
// into the exact `.md` the desktop reads. The format CONSTANTS below are duplicated from the
// desktop (src/lib/md/{gallery,image}.ts) on purpose: the two apps are deliberately decoupled
// (they share only design tokens), and the desktop helpers drag the Tauri store chain, so we
// re-state the small, stable format here rather than import across the app boundary.

/** The fence language carrying an ordered image group (matches src/lib/md/gallery.ts). */
export const GALLERY_FENCE = "pensieve:gallery";
/** The ` | ` separator between a gallery line's ref and its caption (matches desktop). */
export const GALLERY_SEP = " | ";
/** The single vault subfolder all media lives under (matches src/lib/media/ref.ts). */
export const MEDIA_DIR = "media";
/** The fence language carrying a single image with a non-default width/crop (matches
 *  src/lib/md/image.ts) — bare `![]()` can't carry those, so desktop bridges through this
 *  fence whenever an image was resized or cropped in the editor. The phone never creates one
 *  (it has no per-image resize UI) but MUST parse + round-trip it losslessly, or a note that
 *  merely passes through the phone silently loses the desktop's sizing/crop. */
export const IMAGE_FENCE = "pensieve:image";
/** Matches src/lib/md/image.ts DEFAULT_IMAGE_WIDTH — 75% of the text column. */
export const DEFAULT_IMAGE_WIDTH = 0.75;
/** The fence language carrying a voice recording (matches src/lib/md/audio.ts) — audio has no
 *  plain CommonMark form, so it ALWAYS rides this fence: ref on line 1, an optional caption on
 *  the rest. The transcript is a separate sidecar (see lib/media/transcript.ts), never written
 *  into this fence. */
export const AUDIO_FENCE = "pensieve:audio";

/** One image: a vault-relative ref (`media/...`) or a direct url (data:/blob:/http). */
export interface MediaImage {
  ref: string;
  caption?: string;
}

/** One list item, in the markdown-list tree (nesting = indentation on disk, matches the
 *  desktop's BlockNote exporter: `* ` bullets, `N. ` ordered, `* [ ]`/`* [x]` checklists,
 *  2-space indent per nested level). */
export interface ListItemNode {
  ordered: boolean;
  /** Present only for a checklist item. */
  checked?: boolean;
  text: string;
  children: ListItemNode[];
}

/** A parsed note body is a list of these blocks, in order. */
export type NoteBlock =
  | { kind: "text"; text: string }
  | { kind: "image"; ref: string; caption?: string; width?: number; aspect?: number; posX?: number; posY?: number }
  | { kind: "gallery"; images: MediaImage[]; height?: number }
  | { kind: "list"; items: ListItemNode[] }
  | { kind: "audio"; ref: string; caption?: string };

/** The desktop gallery's dragged display HEIGHT rides an optional leading `h=<px>` fence line
 *  (matches src/lib/md/gallery.ts). The phone ignores it for layout but MUST round-trip it so the
 *  `.md` stays byte-identical to the desktop. A media ref never starts with `h=`, so it's unambiguous. */
const HEIGHT_LINE = /^h=(\d+)$/;

/** Is this a vault-relative media path (`media/<noteId>/<file>`)? Direct urls
 *  (data:/blob:/http) are NOT — they resolve as-is (external, like desktop). */
export function isMediaPath(ref: string): boolean {
  return ref.startsWith(MEDIA_DIR + "/");
}

// A single-image markdown line: `![caption](ref)` with nothing else on the line.
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)]+)\)$/;

/** Serialize one image → its markdown line. */
export function imageMd(ref: string, caption?: string): string {
  return `![${caption ?? ""}](${ref})`;
}

function isDefaultWidth(w: number | undefined): boolean {
  return w === undefined || Math.abs(w - DEFAULT_IMAGE_WIDTH) < 1e-6;
}
function isNaturalAspect(a: number | undefined): boolean {
  return !a || a <= 0;
}

/** Serialize a single-image block → markdown: the plain `![caption](ref)` line when it has
 *  default width and natural (uncropped) aspect, else a `pensieve:image` fence carrying the
 *  size/crop (mirrors desktop's encodeImageBlock exactly, so a note that merely passes
 *  through the phone keeps the desktop's sizing byte-for-byte). */
export function encodeImageNoteBlock(b: Extract<NoteBlock, { kind: "image" }>): string {
  if (isDefaultWidth(b.width) && isNaturalAspect(b.aspect)) return imageMd(b.ref, b.caption);
  const parts = [`width=${b.width ?? DEFAULT_IMAGE_WIDTH}`, `aspect=${b.aspect ?? 0}`];
  if (b.posX !== undefined && Math.abs(b.posX - 50) > 1e-6) parts.push(`posX=${b.posX}`);
  if (b.posY !== undefined && Math.abs(b.posY - 50) > 1e-6) parts.push(`posY=${b.posY}`);
  const text = `${b.ref}\n${parts.join(" ")}${b.caption ? `\n${b.caption}` : ""}`;
  return "```" + IMAGE_FENCE + "\n" + text + "\n```";
}

/** Parse one `pensieve:image` fence body (the lines between the ``` fences) → an image block,
 *  or null if there's no ref line. Mirrors desktop's reconstructImageFence. */
function parseImageFenceLines(inner: string[]): NoteBlock | null {
  const ref = (inner[0] ?? "").trim();
  if (!ref) return null;
  const paramLine = inner[1] ?? "";
  let width = DEFAULT_IMAGE_WIDTH;
  let aspect = 0;
  let posX = 50;
  let posY = 50;
  if (paramLine.includes("=")) {
    const w = /width=([\d.]+)/.exec(paramLine);
    const a = /aspect=([\d.]+)/.exec(paramLine);
    const px = /posX=([\d.]+)/.exec(paramLine);
    const py = /posY=([\d.]+)/.exec(paramLine);
    if (w) width = Number(w[1]);
    if (a) aspect = Number(a[1]);
    if (px) posX = Number(px[1]);
    if (py) posY = Number(py[1]);
  } else {
    const w = Number(paramLine);
    if (Number.isFinite(w)) width = w;
  }
  const caption = inner.slice(2).join("\n");
  return {
    kind: "image",
    ref,
    ...(caption ? { caption } : {}),
    ...(!isDefaultWidth(width) ? { width } : {}),
    ...(aspect > 0 ? { aspect } : {}),
    ...(aspect > 0 && Math.abs(posX - 50) > 1e-6 ? { posX } : {}),
    ...(aspect > 0 && Math.abs(posY - 50) > 1e-6 ? { posY } : {}),
  };
}

/** Serialize a voice recording block → a `pensieve:audio` fence (mirrors desktop's
 *  encodeAudioBlock exactly: ref on line 1, the caption — if any — on the rest). */
export function encodeAudioNoteBlock(b: Extract<NoteBlock, { kind: "audio" }>): string {
  const text = b.caption ? `${b.ref}\n${b.caption}` : b.ref;
  return "```" + AUDIO_FENCE + "\n" + text + "\n```";
}

/** Parse one `pensieve:audio` fence body → an audio block, or null if there's no ref line.
 *  Mirrors desktop's reconstructAudioFence. */
function parseAudioFenceLines(inner: string[]): NoteBlock | null {
  const ref = (inner[0] ?? "").trim();
  if (!ref) return null;
  const caption = inner.slice(1).join("\n");
  return { kind: "audio", ref, ...(caption ? { caption } : {}) };
}

// ---- markdown lists (bullet `* `, numbered `N. `, checklist `* [ ]`/`* [x]`) ----

interface RawListLine {
  indent: number;
  ordered: boolean;
  checked?: boolean;
  text: string;
}

const LIST_CHECK_LINE = /^(\s*)[*-]\s+\[([ xX])\]\s+(.*)$/;
const LIST_NUMBER_LINE = /^(\s*)\d+\.\s+(.*)$/;
const LIST_BULLET_LINE = /^(\s*)[*-]\s+(.*)$/;

function matchListLine(line: string): RawListLine | null {
  let m = LIST_CHECK_LINE.exec(line);
  if (m) return { indent: m[1].length, ordered: false, checked: /x/i.test(m[2]), text: m[3] };
  m = LIST_NUMBER_LINE.exec(line);
  if (m) return { indent: m[1].length, ordered: true, text: m[2] };
  m = LIST_BULLET_LINE.exec(line);
  if (m) return { indent: m[1].length, ordered: false, text: m[2] };
  return null;
}

/** Fold a flat, indent-tagged run of list lines into a nesting tree (stack-based: a line
 *  nests under the most recent still-shallower line). */
function buildListTree(lines: RawListLine[]): ListItemNode[] {
  const root: ListItemNode[] = [];
  const stack: { indent: number; node: ListItemNode }[] = [];
  for (const line of lines) {
    const node: ListItemNode = {
      ordered: line.ordered,
      text: line.text,
      children: [],
      ...(line.checked !== undefined ? { checked: line.checked } : {}),
    };
    while (stack.length && stack[stack.length - 1].indent >= line.indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : root).push(node);
    stack.push({ indent: line.indent, node });
  }
  return root;
}

/** Inverse of buildListTree: a nesting tree → markdown lines (2-space indent per level,
 *  ordered items renumbered sequentially per sibling run — matches the desktop exporter). */
function flattenListTree(nodes: ListItemNode[], depth = 0): string[] {
  const out: string[] = [];
  nodes.forEach((n, i) => {
    const indent = "  ".repeat(depth);
    const marker = n.checked !== undefined ? `* [${n.checked ? "x" : " "}] ` : n.ordered ? `${i + 1}. ` : "* ";
    out.push(indent + marker + n.text);
    out.push(...flattenListTree(n.children, depth + 1));
  });
  return out;
}

/** Serialize a list block back to its markdown lines (joined). */
export function listMd(items: ListItemNode[]): string {
  return flattenListTree(items).join("\n");
}

/** Accessible alt/aria-label for an image: the caption, or a plain "Image" fallback (never
 *  an empty alt — which marks a content image decorative — nor an opaque blob/asset URL).
 *  Matches the desktop src/lib/media/alt.ts helper (the two apps are decoupled). */
export function mediaAlt(caption?: string | null): string {
  const c = caption?.trim();
  return c ? c : "Image";
}

/** Serialize an ordered image list → the `pensieve:gallery` fenced block (as a string
 *  that may span several lines). One `ref | caption` per line; caption omitted when empty. */
export function galleryMd(images: MediaImage[], height?: number): string {
  const lines = images.map((img) => {
    const caption = (img.caption ?? "").replace(/\n/g, " ").trim();
    return caption ? `${img.ref}${GALLERY_SEP}${caption}` : img.ref;
  });
  const h = Math.round(Number(height) || 0);
  if (h > 0) lines.unshift(`h=${h}`);
  return "```" + GALLERY_FENCE + "\n" + lines.join("\n") + "\n```";
}

/** Parse one gallery fence body (the lines between the ``` fences) → images. */
function parseGalleryLines(lines: string[]): MediaImage[] {
  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const sep = line.indexOf(GALLERY_SEP);
      if (sep === -1) return { ref: line };
      return { ref: line.slice(0, sep).trim(), caption: line.slice(sep + GALLERY_SEP.length).trim() };
    });
}

/** Parse a note body string → an ordered block list (text / image / gallery / list). */
export function parseNoteContent(content: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  const lines = (content ?? "").split("\n");
  const galleryFenceOpen = "```" + GALLERY_FENCE;
  const imageFenceOpen = "```" + IMAGE_FENCE;
  const audioFenceOpen = "```" + AUDIO_FENCE;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === galleryFenceOpen) {
      // collect until the closing ``` (or EOF)
      const inner: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim() === "```") break;
        inner.push(lines[j]);
      }
      const body = inner.map((l) => l.trim()).filter((l) => l.length > 0);
      let height = 0;
      if (body.length && HEIGHT_LINE.test(body[0])) {
        height = Number(HEIGHT_LINE.exec(body[0])![1]);
        body.shift();
      }
      const images = parseGalleryLines(body);
      if (images.length) blocks.push({ kind: "gallery", images, ...(height > 0 ? { height } : {}) });
      i = j; // skip past the closing fence
      continue;
    }
    if (line.trim() === imageFenceOpen) {
      const inner: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim() === "```") break;
        inner.push(lines[j]);
      }
      const block = parseImageFenceLines(inner);
      if (block) blocks.push(block);
      i = j;
      continue;
    }
    if (line.trim() === audioFenceOpen) {
      const inner: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim() === "```") break;
        inner.push(lines[j]);
      }
      const block = parseAudioFenceLines(inner);
      if (block) blocks.push(block);
      i = j;
      continue;
    }
    const m = line.trim().match(IMAGE_LINE);
    if (m) {
      const caption = m[1] || undefined;
      blocks.push({ kind: "image", ref: m[2].trim(), ...(caption ? { caption } : {}) });
      continue;
    }
    const first = matchListLine(line);
    if (first) {
      const raw: RawListLine[] = [first];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const next = matchListLine(lines[j]);
        if (!next) break;
        raw.push(next);
      }
      blocks.push({ kind: "list", items: buildListTree(raw) });
      i = j - 1; // the loop's i++ advances to j
      continue;
    }
    blocks.push({ kind: "text", text: line });
  }
  return blocks;
}

/** Serialize a block list back to a note body string (inverse of parseNoteContent). */
export function serializeBlocks(blocks: NoteBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "text") return b.text;
      if (b.kind === "image") return encodeImageNoteBlock(b);
      if (b.kind === "list") return listMd(b.items);
      if (b.kind === "audio") return encodeAudioNoteBlock(b);
      return galleryMd(b.images, b.height);
    })
    .join("\n");
}

// ---- emergent gallery helpers (pure, unit-tested) ----

/** A gallery that drops to a single image collapses back to a single image block;
 *  2+ stays a gallery. Mirrors the desktop 1<->2 collapse/promote. */
export function collapseImages(images: MediaImage[]): NoteBlock | null {
  if (images.length === 0) return null;
  if (images.length === 1) return { kind: "image", ref: images[0].ref, ...(images[0].caption ? { caption: images[0].caption } : {}) };
  return { kind: "gallery", images };
}

/** Move the image at `from` to `to` (for long-press reorder). Returns a new array. */
export function reorderImages(images: MediaImage[], from: number, to: number): MediaImage[] {
  if (from < 0 || from >= images.length || to < 0 || to >= images.length || from === to) return images.slice();
  const next = images.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Decide the block for a fresh insert of `count` images with no adjacent media:
 *  1 → single image, 2+ → gallery. */
export function planInsert(images: MediaImage[]): NoteBlock | null {
  return collapseImages(images);
}

// ---- preview stripping (for the reel snippet, matches desktop src/lib/text.ts intent) ----

const GALLERY_FENCE_BLOCK = new RegExp("```" + GALLERY_FENCE + "[\\s\\S]*?```", "g");
const IMAGE_FENCE_BLOCK = new RegExp("```" + IMAGE_FENCE + "[\\s\\S]*?```", "g");
const AUDIO_FENCE_BLOCK = new RegExp("```" + AUDIO_FENCE + "[\\s\\S]*?```", "g");

/** Strip media markdown from a body so the reel snippet shows clean prose, not raw refs.
 *  A single image becomes its caption (or a 📷 marker); a gallery becomes a 📷 marker; a
 *  recording becomes a 🎙️ marker. */
export function stripMediaForPreview(content: string): string {
  return (content ?? "")
    .replace(GALLERY_FENCE_BLOCK, "📷 Photos")
    .replace(IMAGE_FENCE_BLOCK, "📷 Photo")
    .replace(AUDIO_FENCE_BLOCK, "🎙️ Recording")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, cap) => (cap ? `📷 ${cap}` : "📷 Photo"))
    .replace(/\n{2,}/g, "\n")
    .trim();
}
