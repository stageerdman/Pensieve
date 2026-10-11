// useWordSelection.ts — deterministic tap/click-to-select-word in the note body.
//
// The DOM glue around the pure lib/wand/wordSelection.findWordBounds. Ported from
// 01-the-wand-v2.html ~842-876 (selectWordAtPoint) + ~962-974 (the dblclick + touch
// double-tap wiring). WebKit's native word granularity is unreliable here (it inserts
// non-breaking spaces it won't break on, and autocorrect fragments text nodes), so we
// compute the word ourselves from the tap point and override the native selection.
//
// Native addEventListener (HARD constraint #4): the touch path runs on a
// `setTimeout(0)` AFTER iOS's own selection pass so ours wins.

import { useEffect } from "react";
import { findWordBounds } from "../lib/wand/wordSelection";

export function useWordSelection(noteBodyRef: React.RefObject<HTMLElement>): void {
  useEffect(() => {
    const noteBody = noteBodyRef.current;
    if (!noteBody) return;

    function selectWordAtPoint(x: number, y: number): boolean {
      let node: Node | null = null;
      let offset = 0;
      const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      };
      if (doc.caretRangeFromPoint) {
        const r = doc.caretRangeFromPoint(x, y);
        if (r) {
          node = r.startContainer;
          offset = r.startOffset;
        }
      } else if (doc.caretPositionFromPoint) {
        const p = doc.caretPositionFromPoint(x, y);
        if (p) {
          node = p.offsetNode;
          offset = p.offset;
        }
      }
      if (!node) return false;
      let block: Node | null = node;
      while (block && block.parentNode !== noteBody) block = block.parentNode;
      if (!block || block.parentNode !== noteBody) return false;
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      const parts: { node: Text; start: number }[] = [];
      let full = "";
      let tn: Node | null;
      while ((tn = walker.nextNode())) {
        parts.push({ node: tn as Text, start: full.length });
        full += (tn as Text).nodeValue || "";
      }
      if (!full) return false;
      let g = 0;
      if (node.nodeType === 3) {
        const rec = parts.find((p) => p.node === node);
        g = (rec ? rec.start : 0) + offset;
      }
      const bounds = findWordBounds(full, g);
      if (!bounds) return false;
      const locate = (gg: number): { node: Text; offset: number } => {
        for (const p of parts) {
          if (gg <= p.start + (p.node.nodeValue || "").length) return { node: p.node, offset: gg - p.start };
        }
        const last = parts[parts.length - 1];
        return { node: last.node, offset: (last.node.nodeValue || "").length };
      };
      const a = locate(bounds.start);
      const b = locate(bounds.end);
      const sel = window.getSelection();
      const rng = document.createRange();
      try {
        rng.setStart(a.node, a.offset);
        rng.setEnd(b.node, b.offset);
      } catch {
        return false;
      }
      sel?.removeAllRanges();
      sel?.addRange(rng);
      return true;
    }

    // Desktop: double-click selects exactly the word.
    const onDblClick = (e: MouseEvent) => {
      if (selectWordAtPoint(e.clientX, e.clientY)) e.preventDefault();
    };
    // Touch: detect a double-tap and OVERRIDE the native (broken) word selection.
    let lastTapT = 0,
      lastTapX = 0,
      lastTapY = 0;
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "touch") return; // mouse handled by dblclick
      const t = e.timeStamp || performance.now();
      if (t - lastTapT < 350 && Math.abs(e.clientX - lastTapX) < 24 && Math.abs(e.clientY - lastTapY) < 24) {
        const x = e.clientX,
          y = e.clientY;
        setTimeout(() => selectWordAtPoint(x, y), 0); // run after iOS's own pass → ours wins
        lastTapT = 0;
      } else {
        lastTapT = t;
        lastTapX = e.clientX;
        lastTapY = e.clientY;
      }
    };

    noteBody.addEventListener("dblclick", onDblClick);
    noteBody.addEventListener("pointerup", onPointerUp);
    return () => {
      noteBody.removeEventListener("dblclick", onDblClick);
      noteBody.removeEventListener("pointerup", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
