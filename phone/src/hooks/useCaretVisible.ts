// useCaretVisible.ts — keep the caret above the keyboard + toolbar.
//
// Ported from 01-the-wand-v2.html ~878-900. The note is a full-screen overlay, so
// the browser doesn't know the keyboard covers the bottom and lets the caret slide
// under the UI. We read the caret rect and scroll #noteSurface ourselves using
// visualViewport (which DOES exclude the keyboard). rAF-coalesced.

import { useRef } from "react";
import { currentBlock } from "../components/note/noteEditing";

const TOOLBAR_H = 52;

/** Returns a stable `keepCaretVisible()`. `upRef` tells it whether the keyboard (and
 *  so the toolbar) is up. */
export function useCaretVisible(
  noteSurfaceRef: React.RefObject<HTMLElement>,
  noteBodyRef: React.RefObject<HTMLElement>,
  upRef: React.MutableRefObject<boolean>,
): () => void {
  const caretRAF = useRef<number | null>(null);
  const fn = useRef(() => {
    if (caretRAF.current) return;
    caretRAF.current = requestAnimationFrame(() => {
      caretRAF.current = null;
      const surface = noteSurfaceRef.current;
      const body = noteBodyRef.current;
      if (!surface || !body) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const rng = sel.getRangeAt(0);
      let rect: DOMRect | null =
        rng && typeof rng.getBoundingClientRect === "function" ? rng.getBoundingClientRect() : null;
      if (!rect || (!rect.height && !rect.top && !rect.bottom)) {
        const b = currentBlock(body);
        if (b) rect = b.getBoundingClientRect();
      }
      if (!rect) return;
      const vv = window.visualViewport;
      const top = vv ? vv.offsetTop : 0;
      const h = vv ? vv.height : window.innerHeight;
      const safeBottom = top + h - (upRef.current ? TOOLBAR_H : 0) - 30; // 30 = breathing room
      const safeTop = top + 70; // below the top bar
      if (rect.bottom > safeBottom) surface.scrollTop += rect.bottom - safeBottom;
      else if (rect.top < safeTop) surface.scrollTop -= safeTop - rect.top;
    });
  });
  return fn.current;
}
