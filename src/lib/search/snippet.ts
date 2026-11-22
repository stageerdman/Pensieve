// Snippet extraction: given a note's body text and the query, return a short window of
// context around the first match with the matched terms' ranges, so the UI can show
// "…the part of text that was found and its context around" with highlights. Pure and
// case-insensitive; returns null when no term occurs in the text.

import { planQuery } from "./rank/queryPlan";

export interface Snippet {
  text: string; // the context window (original casing, trimmed with ellipses)
  marks: Array<[number, number]>; // [start, end) ranges to highlight, relative to `text`
}

/** Find the first occurrence (case-insensitive) of any term in `body`. */
function firstHit(bodyLower: string, terms: readonly string[]): { index: number; term: string } | null {
  let best: { index: number; term: string } | null = null;
  for (const t of terms) {
    const i = bodyLower.indexOf(t);
    if (i !== -1 && (best === null || i < best.index)) best = { index: i, term: t };
  }
  return best;
}

/** All [start,end) ranges of any term within [from,to) of bodyLower. */
function marksWithin(bodyLower: string, terms: readonly string[], from: number, to: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const t of terms) {
    let i = bodyLower.indexOf(t, from);
    while (i !== -1 && i < to) {
      ranges.push([i, Math.min(i + t.length, to)]);
      i = bodyLower.indexOf(t, i + t.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  // Merge overlaps ("sum" + "summon") so a renderer never repeats a character.
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** Highlight every query term in a short, whole string (a title): the string itself plus
 *  its match ranges. No windowing; an empty `marks` when nothing matches. Only the words the
 *  ranker matches light up (no stop words or one-letter words — rank/queryPlan). */
export function markTerms(text: string, query: string): Snippet {
  const terms = planQuery(query).terms;
  if (terms.length === 0 || !text) return { text, marks: [] };
  return { text, marks: marksWithin(text.toLowerCase(), terms, 0, text.length) };
}

/**
 * Build a snippet of `body` around the first match of any (lower-case) term. `radius` chars
 * of context on each side, snapped outward to word boundaries, with "…" where text was cut.
 * Pass `lower` (body lower-cased) when you have it cached — lower-casing a long body per
 * keystroke is what made typing lag.
 */
export function makeSnippet(body: string, terms: readonly string[], radius = 48, lower = body.toLowerCase()): Snippet | null {
  if (terms.length === 0 || !body) return null;
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
