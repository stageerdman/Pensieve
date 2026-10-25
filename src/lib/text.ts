// Small pure text helpers — shared so title/slug/word-count logic lives in one place.

/** The note title is the first non-empty line of PROSE, with leading markdown heading AND
 *  list marks stripped (a note that starts with a bullet/numbered/checklist line still gets
 *  a clean title — not "* Co tím myslíte?" with the marker baked in). Media is not a title:
 *  fenced blocks (our `pensieve:audio`/`image`/`gallery` fences and any code) are skipped
 *  whole, as are bare image lines — so a recording-only or image-only note has NO title
 *  (empty string) — the UI shows nothing rather than inventing one or printing the fence
 *  marker / media file path. Mirrors excerptFromMarkdown's fence + mark handling. */
export function titleFromMarkdown(md: string): string {
  let inFence = false;
  for (const raw of md.split("\n")) {
    const line = raw.replace(/​/g, "").trim(); // drop blank-line placeholders (ZWSP)
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence; // enter/leave a fenced block (incl. our media fences) — never a title
      continue;
    }
    if (inFence || !line) continue;
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(line)) continue; // a lone image is not a title
    const t = line
      .replace(/^#{1,6}\s*/, "")
      .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, "")
      .replace(/^\d+\.\s+/, "")
      .trim();
    if (t) return t;
  }
  return ""; // no prose → title-less (e.g. a voice memo); callers decide how to render empty
}

/** Filesystem-safe slug derived from the title (used for the .md basename). */
export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "untitled";
}

/** A short plain-text preview of a note body for the sidebar: the first non-empty
 *  lines with common Markdown marks stripped, whitespace collapsed, capped. Stored
 *  on save so listing never has to parse bodies at render time. */
export function excerptFromMarkdown(md: string, max = 140): string {
  const title = titleFromMarkdown(md);
  const lines = md.split("\n");
  const parts: string[] = [];
  let skippedTitle = false;
  let inFence = false; // inside a ``` code block — skipped entirely (previews = prose)
  for (const raw of lines) {
    const line = raw.replace(/​/g, "").trim(); // drop blank-line placeholders (ZWSP)
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line) continue;
    const text = line
      .replace(/^#{1,6}\s*/, "") // heading marks
      .replace(/^[-*+]\s+/, "") // bullet marks
      .replace(/^>\s*/, "") // blockquote
      .replace(/^\d+\.\s+/, "") // ordered list
      .replace(/`([^`]*)`/g, "$1") // inline code → its text, no backticks
      .replace(/[*_`~]/g, "") // remaining emphasis/code marks
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links/images → their text
      .replace(/\{(?:fg|bg):[^}]*\}|\{\/\}/g, "") // our colour sentinels
      .replace(/\{@[^|}]*\|([^}]*)\}/g, "$1") // note links → their title
      .trim();
    if (!text) continue;
    // Drop the first content line if it is just the title (already shown on the row).
    if (!skippedTitle && text === title) {
      skippedTitle = true;
      continue;
    }
    parts.push(text);
    if (parts.join(" ").length >= max) break;
  }
  const out = parts.join(" ").replace(/\s+/g, " ").trim();
  return out.length > max ? out.slice(0, max).trimEnd() + "…" : out;
}

/** Full plain-text of a note body for the search index: ALL content (unlike the capped
 *  preview), with Markdown marks, code fences, link syntax and our colour/note-link
 *  sentinels stripped to their readable text. Line structure is preserved (snippets
 *  collapse whitespace themselves). Used to build the full-text haystack. */
export function plainTextFromMarkdown(md: string): string {
  const out: string[] = [];
  for (const raw of md.split("\n")) {
    let line = raw.replace(/​/g, ""); // ZWSP blank-line placeholders
    if (/^\s*(```|~~~)/.test(line)) continue; // fence delimiters (keep the code lines)
    line = line
      .replace(/^#{1,6}\s*/, "") // heading marks
      .replace(/^\s*[-*+]\s+/, "") // bullet marks
      .replace(/^\s*>\s*/, "") // blockquote
      .replace(/^\s*\d+\.\s+/, "") // ordered list
      .replace(/`([^`]*)`/g, "$1") // inline code → text
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links/images → text
      .replace(/\{(?:fg|bg):[^}]*\}|\{\/\}/g, "") // colour sentinels
      .replace(/\{@[^|}]*\|([^}]*)\}/g, "$1") // note links → their title
      .replace(/[*_~]/g, ""); // remaining emphasis marks
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Non-space character count of the note's CONTENT — everything after the title
 *  line, with whitespace removed. Drives the flask fill level (a title-only note
 *  has zero content → an empty flask). Cheap; computed once per note in list(). */
export function contentCharCount(md: string): number {
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++; // skip leading blank lines
  // Line i is the title; everything after it is content.
  return lines.slice(i + 1).join("").replace(/\s/g, "").length;
}

/** Word count of the note's content, ignoring markdown punctuation noise. */
export function wordCount(md: string): number {
  const words = md
    .replace(/[#>*_`~\-\[\]()!]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
}
