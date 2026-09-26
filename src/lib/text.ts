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

/** Word count of the note's content, ignoring markdown punctuation noise. */
export function wordCount(md: string): number {
  const words = md
    .replace(/[#>*_`~\-\[\]()!]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
}
