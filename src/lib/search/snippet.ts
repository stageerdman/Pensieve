// Snippet extraction: given a note's body text and the query, return a short window of
// context around the first match with the matched terms' ranges, so the UI can show
// "…the part of text that was found and its context around" with highlights. Pure and
// case-insensitive; returns null when no term occurs in the text.

import { queryTerms } from "./tokenize";

export interface Snippet {
  text: string; // the context window (original casing, trimmed with ellipses)
  marks: Array<[number, number]>; // [start, end) ranges to highlight, relative to `text`
}

/** Find the first occurrence (case-insensitive) of any term in `body`. */
function firstHit(bodyLower: string, terms: string[]): { index: number; term: string } | null {
  let best: { index: number; term: string } | null = null;
  for (const t of terms) {
    const i = bodyLower.indexOf(t);
    if (i !== -1 && (best === null || i < best.index)) best = { index: i, term: t };
  }
  return best;
}

/** All [start,end) ranges of any term within [from,to) of bodyLower. */
function marksWithin(bodyLower: string, terms: string[], from: number, to: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const t of terms) {
    let i = bodyLower.indexOf(t, from);
    while (i !== -1 && i < to) {
      ranges.push([i, Math.min(i + t.length, to)]);
      i = bodyLower.indexOf(t, i + t.length);
    }
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/**
 * Build a snippet of `body` around the first query match. `radius` chars of context on
 * each side, snapped outward to word boundaries, with "…" where text was cut.
 */
export function makeSnippet(body: string, query: string, radius = 48): Snippet | null {
  const terms = queryTerms(query);
  if (terms.length === 0 || !body) return null;
  const lower = body.toLowerCase();
  const hit = firstHit(lower, terms);
  if (!hit) return null;

  let start = Math.max(0, hit.index - radius);
  let end = Math.min(body.length, hit.index + hit.term.length + radius);
  // Snap to word boundaries so we don't cut mid-word.
  while (start > 0 && /\S/.test(body[start - 1])) start--;
  while (end < body.length && /\S/.test(body[end])) end++;

  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  const windowText = body.slice(start, end).trim();

  // Collapse internal runs of whitespace/newlines for a one-line snippet, tracking how
  // that shifts mark offsets. Simplest correct approach: recompute marks on the final
  // string.
  const collapsed = windowText.replace(/\s+/g, " ");
  const text = prefix + collapsed + suffix;
  const offset = prefix.length;
  const collapsedLower = collapsed.toLowerCase();
  const marks = marksWithin(collapsedLower, terms, 0, collapsed.length).map(
    ([s, e]) => [s + offset, e + offset] as [number, number],
  );

  return { text, marks };
}
