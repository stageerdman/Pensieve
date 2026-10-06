import { useEffect, type RefObject } from "react";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { log } from "../lib/logger";
import { blocksInBand, isBlankMarqueeTarget, rectBetween, type BlockRect } from "./blockMarquee";

// Minimal shape we need from the BlockNote editor — avoids leaking its full generic type.
interface MarqueeEditor {
  prosemirrorView: EditorView | undefined;
  setSelection: (anchor: string, head: string) => void;
}

type Row = BlockRect & { el: HTMLElement };

// Pointer must travel this far before a press becomes a marquee (below it, it's a plain
// click — placing a caret, grabbing the handle — left untouched). Matches the gallery's
// drag threshold for a consistent feel.
const DRAG_THRESHOLD = 5;

// Notion-style marquee (rubber-band) block selection. Press in the blank editor margin
// and drag: a band rectangle picks every row it reaches, and we set a multi-block
// selection across them. BlockNote's own drag handle then moves the whole selection as a
// group — so this hook only needs to *create* the selection, not re-implement dragging.
//
// Pointer-based (not HTML5 drag) for the same reason as the gallery strip: WKWebView
// fires HTML5 drop unreliably. See blockMarquee.ts for the pure geometry/targeting.
export function useBlockMarquee(editor: MarqueeEditor, wrapRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // The live press: start point + whether it has crossed into an actual marquee. A
    // closure variable (not state) so the window handlers read fresh values cheaply.
    let press: { startX: number; startY: number; active: boolean } | null = null;
    let band: HTMLDivElement | null = null;
    let suppressClick = false;

    // Every top-level row's id + vertical extent, read fresh at drag time (the doc can
    // change between drags). Nested blocks are excluded so a parent and its children
    // aren't double-counted — we select whole top-level rows, like Notion.
    const topRows = (): Row[] => {
      const view = editor.prosemirrorView;
      if (!view) return [];
      const els = Array.from(view.dom.querySelectorAll<HTMLElement>('[data-node-type="blockContainer"][data-id]'));
      return els
        .filter((el) => !el.parentElement?.closest('[data-node-type="blockContainer"]'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.getAttribute("data-id") as string, top: r.top, bottom: r.bottom, el };
        });
    };

    // Set a multi-row selection spanning ids[first..last]. setSelection needs both
    // endpoints to be content blocks; if an endpoint is a no-content block (image,
    // divider), we trim the range inward until it takes — the in-between blocks are still
    // carried along by BlockNote's drag (it expands to block boundaries).
    const setRange = (ids: string[]): boolean => {
      for (let lo = 0; lo < ids.length; lo++) {
        for (let hi = ids.length - 1; hi > lo; hi--) {
          try {
            editor.setSelection(ids[lo], ids[hi]);
            return true;
          } catch {
            /* endpoint not selectable — try a tighter range */
          }
        }
      }
      return false;
    };

    // Single row in the band → a node selection on it (BlockNote highlights node
    // selections itself and its handle drags the one block).
    const selectSingle = (el: HTMLElement) => {
      const view = editor.prosemirrorView;
      if (!view) return;
      try {
        const pos = view.posAtDOM(el, 0);
        const { state } = view;
        view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
      } catch {
        /* not node-selectable (e.g. a no-content block) — leave selection as is */
      }
    };

    const applySelection = (curY: number): number => {
      const rows = topRows();
      const ids = blocksInBand(rows, { top: press!.startY, bottom: curY });
      if (ids.length >= 2) setRange(ids);
      else if (ids.length === 1) {
        const row = rows.find((r) => r.id === ids[0]);
        if (row) selectSingle(row.el);
      }
      return ids.length;
    };

    const drawBand = (ax: number, ay: number, bx: number, by: number) => {
      if (!band) {
        band = document.createElement("div");
        band.className = "pensieve-marquee";
        document.body.appendChild(band);
      }
      const r = rectBetween(ax, ay, bx, by);
      band.style.left = `${r.left}px`;
      band.style.top = `${r.top}px`;
      band.style.width = `${r.width}px`;
      band.style.height = `${r.height}px`;
    };

    const endDrag = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      if (band) {
        band.remove();
        band = null;
      }
      wrap.classList.remove("pensieve-marqueeing");
      press = null;
    };

    const onMove = (e: PointerEvent) => {
      if (!press) return;
      if (!press.active) {
        if (Math.abs(e.clientX - press.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - press.startY) < DRAG_THRESHOLD) return;
        press.active = true;
        wrap.classList.add("pensieve-marqueeing");
        log.debug("editor", "marquee.start", {});
      }
      // Suppress native text selection/caret while the band is live.
      e.preventDefault();
      drawBand(press.startX, press.startY, e.clientX, e.clientY);
      applySelection(e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      const wasActive = press?.active ?? false;
      if (wasActive) {
        const n = applySelection(e.clientY);
        suppressClick = true; // swallow the click the browser fires after the drag
        log.debug("editor", "marquee.end", { rows: n });
      }
      endDrag();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // primary button only
      if (!isBlankMarqueeTarget(e.target as Element | null, wrap)) return;
      press = { startX: e.clientX, startY: e.clientY, active: false };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
    };

    const onClickCapture = (e: MouseEvent) => {
      if (suppressClick) {
        suppressClick = false;
        e.stopPropagation();
        e.preventDefault();
      }
    };

    wrap.addEventListener("pointerdown", onDown, true);
    wrap.addEventListener("click", onClickCapture, true);
    return () => {
      wrap.removeEventListener("pointerdown", onDown, true);
      wrap.removeEventListener("click", onClickCapture, true);
      endDrag();
    };
  }, [editor, wrapRef]);
}
