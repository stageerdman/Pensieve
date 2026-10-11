// noteEditing.ts — imperative DOM helpers for the single-editor note body.
//
// Co-located with the note component (they touch the DOM, so not in lib/). Ported
// from 01-the-wand-v2.html ~826-840. Apple-Notes model: the first block is the title
// (auto-<h1>); everything after is body.

/** The top-level block (direct child of noteBody) the caret is in. Source ~826-831. */
export function currentBlock(noteBody: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  let n: Node | null = sel && sel.anchorNode;
  if (!n) return null;
  if (n.nodeType === 3) n = n.parentNode;
  while (n && n.parentNode !== noteBody) n = n.parentNode;
  return n && n.parentNode === noteBody ? (n as HTMLElement) : null;
}

/** Collapse the selection to `node`+`off`. Source ~832-835. */
export function placeCaret(node: Node, off: number): void {
  const r = document.createRange();
  const s = window.getSelection();
  r.setStart(node, off);
  r.collapse(true);
  s?.removeAllRanges();
  s?.addRange(r);
}

/** Toggle the empty-title placeholder. Source ~836-839. */
export function syncPlaceholders(noteBody: HTMLElement): void {
  const h = noteBody.firstElementChild;
  noteBody.classList.toggle("title-empty", !h || h.tagName !== "H1" || !h.textContent!.trim());
}

/** Put the caret at the start of the title line. Source ~840. */
export function focusTitle(noteBody: HTMLElement): void {
  const h = noteBody.firstElementChild;
  if (h) {
    noteBody.focus();
    placeCaret(h, 0);
  }
}
