// Small pure text helpers — shared so title/slug/word-count logic lives in one place.

/** The note title is the first non-empty line, with leading markdown heading marks
 *  stripped. Falls back to "Untitled". */
export function titleFromMarkdown(md: string): string {
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    return line.replace(/^#{1,6}\s*/, "").trim() || "Untitled";
  }
  return "Untitled";
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
    const line = raw.trim();
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

/** Word count of the note's content, ignoring markdown punctuation noise. */
export function wordCount(md: string): number {
  const words = md
    .replace(/[#>*_`~\-\[\]()!]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
}
