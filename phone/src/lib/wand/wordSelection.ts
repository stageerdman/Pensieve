// wordSelection.ts — pure, DOM-free word-boundary finding for tap-to-select-word.
//
// Ported from 01-the-wand-v2.html ~lines 842-876 (`selectWordAtPoint`) and the
// "contenteditable word selection" lesson in wiki.md: WebKit's native double-tap
// word granularity is unreliable in this editor — it inserts non-breaking spaces
// between words and does NOT treat them as word breaks (selection runs across
// them), and autocorrect fragments text nodes (1-2 letter selections). The fix is
// to compute the word ourselves: flatten the block's text across all its text
// nodes into one string, then expand a tap offset to real separators.
//
// This module is the DOM-free core only: given the flattened string + a global tap
// offset into it, find the word's [start, end) bounds. The DOM glue — walking text
// nodes, `caretRangeFromPoint`, mapping the flat offset back to a node+offset, and
// setting the Range — is a hook, not here (Wave 2).

/** Real word separators: whitespace (incl. the non-breaking space WebKit inserts
 *  between words) and punctuation. Source ~849:
 *  `const WORD_SEP = /[\s.,;:!?()\[\]{}"'"”‘’…—– ]/;` (the trailing char in the
 *  class is U+00A0, a non-breaking space, not a regular space). */
const WORD_SEP = /[\s.,;:!?()[\]{}"'“”‘’…—– ]/;

export interface WordBounds {
  start: number;
  end: number;
}

/** Find the bounds of the word containing (or immediately touching) `offset` in
 *  the flattened block string `text`. Returns null when the tap landed in
 *  whitespace (both the tapped char and the one before it are separators) or no
 *  word could be formed — same as the original returning `false` to let native
 *  selection handle it. Source ~862-868:
 *  ```
 *  if(WORD_SEP.test(full[g] || "") && WORD_SEP.test(full[g-1] || "")) return false;
 *  let s = Math.min(g, full.length), e = s;
 *  while(s > 0 && !WORD_SEP.test(full[s-1])) s--;
 *  while(e < full.length && !WORD_SEP.test(full[e])) e++;
 *  if(e <= s) return false;
 *  ``` */
export function findWordBounds(text: string, offset: number): WordBounds | null {
  if (WORD_SEP.test(text[offset] || "") && WORD_SEP.test(text[offset - 1] || "")) return null;
  let s = Math.min(offset, text.length);
  let e = s;
  while (s > 0 && !WORD_SEP.test(text[s - 1])) s--;
  while (e < text.length && !WORD_SEP.test(text[e])) e++;
  if (e <= s) return null;
  return { start: s, end: e };
}
