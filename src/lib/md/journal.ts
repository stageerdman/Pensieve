// The inline journal (`journal` block) in the extended-Markdown standard.
//
// A journal is an ordered run of photographed paper-journal pages, produced by AI
// processing of a Raw Memory batch (see updates/2026-11-09 RAW-MEMORY-JOURNAL). It shares
// the gallery block's fence shape (one line per image, caption optional) so the two formats
// stay trivially easy to reason about together, but is its own block/type — not an
// `imageGroup` with a flag — because its default behaviour is sequential page-by-page
// viewing (the real lightbox, swipe/arrow-key through pages) rather than Gallery's
// free-form justified photo grid (see wiki.md, "a new block, like gallery but a bit
// different behaviour or intent").
//
//   ```pensieve:journal
//   media/note1/a.png | Nov 3
//   media/note1/b.png
//   media/note1/c.png
//   ```
//
// Kept here in lib/md (not components) so the markdown layer never imports UI; the block
// component imports these pure helpers. Mirrors lib/md/gallery's url↔ref / resolve shape.

import { refForUrl, resolveMediaUrl } from "../media/url";
import { isMediaPath } from "../media/ref";

/** The fence language carrying an ordered journal-page run. */
export const JOURNAL_FENCE = "pensieve:journal";

/** One photographed page. `url` is a loadable url in-editor / a vault ref on disk.
 *  `caption` is free text (e.g. a detected date label); `saving` is a transient
 *  per-tile flag (never serialized), mirroring GalleryImage. */
export interface JournalPage {
  url: string;
  caption?: string;
  saving?: boolean;
}

interface Block {
  type?: string;
  props?: { pages?: string; [k: string]: unknown };
  content?: unknown;
  children?: Block[];
  [k: string]: unknown;
}

export function isJournalBlock(b: Block): boolean {
  return b?.type === "journal";
}

/** Parse the block's `pages` JSON prop → the ordered list (defensive: never throws). */
export function parseJournalPages(json: string | undefined): JournalPage[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.url === "string")
      .map((x) => ({
        url: x.url as string,
        ...(x.caption ? { caption: String(x.caption) } : {}),
        ...(x.saving ? { saving: true } : {}),
      }));
  } catch {
    return [];
  }
}

/** Serialize the ordered list → the `pages` JSON prop. */
export function stringifyJournalPages(pages: JournalPage[]): string {
  return JSON.stringify(
    pages.map((p) => ({
      url: p.url,
      ...(p.caption ? { caption: p.caption } : {}),
      ...(p.saving ? { saving: true } : {}),
    })),
  );
}

const fenceText = (b: Block): string =>
  (Array.isArray(b.content) && (b.content[0] as { text?: string })?.text) || "";

/** SAVE: rewrite each page's url → its vault ref, then emit the `pensieve:journal` fence.
 *  One line per page, `ref | caption` (caption omitted when empty); order preserved. */
export function encodeJournalBlock(b: Block): Block {
  const pages = parseJournalPages(b.props?.pages);
  const lines = pages.map((p) => {
    const ref = refForUrl(p.url) ?? p.url; // inverse of load-time resolution
    const caption = (p.caption ?? "").replace(/\n/g, " ").trim();
    return caption ? `${ref} | ${caption}` : ref;
  });
  return { type: "codeBlock", props: { language: JOURNAL_FENCE }, content: [{ type: "text", text: lines.join("\n"), styles: {} }] };
}

/** LOAD: a `pensieve:journal` fence → a journal block (refs, order preserved), else null. */
export function reconstructJournalFence(b: Block): Block | null {
  const lang = b.type === "codeBlock" && (b.props as { language?: string } | undefined)?.language;
  if (lang !== JOURNAL_FENCE) return null;
  const rawLines = fenceText(b)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const pages: JournalPage[] = rawLines.map((line) => {
    const sep = line.indexOf(" | ");
    const url = sep === -1 ? line : line.slice(0, sep).trim();
    const caption = sep === -1 ? undefined : line.slice(sep + 3).trim();
    return { url, ...(caption ? { caption } : {}) };
  });
  return { type: "journal", props: { pages: stringifyJournalPages(pages) } };
}

/** LOAD: resolve a journal block's refs → loadable urls (new object; registers the pairing
 *  so SAVE's refForUrl rewrite is lossless). A missing/external url is kept as-is. */
export async function resolveJournalBlock(b: Block): Promise<Block> {
  const pages = parseJournalPages(b.props?.pages);
  const resolved = await Promise.all(
    pages.map(async (p) => {
      if (!isMediaPath(p.url)) return p;
      const url = await resolveMediaUrl(p.url);
      return { ...p, url: url ?? p.url };
    }),
  );
  return { ...b, props: { ...b.props, pages: stringifyJournalPages(resolved) } };
}
