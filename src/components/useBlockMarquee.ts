import { useEffect, type RefObject } from "react";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { log } from "../lib/logger";
import { blocksInBand, isBlankMarqueeTarget, nearestRowId, rectBetween, type BlockRect } from "./blockMarquee";

// Minimal shape we need from the BlockNote editor — avoids leaking its full generic type.
interface MarqueeEditor {
  prosemirrorView: EditorView | undefined;
  setSelection: (anchor: string, head: string) => void;
}

type Row = BlockRect & { el: HTMLElement };

// Pointer must travel this far before a press becomes a marquee (below it, it's a plain
// click — placing a caret, grabbing the handle — left untouched).
const DRAG_THRESHOLD = 5;
// Auto-scroll kicks in within this many px of the scroll edge; speed scales with depth.
const EDGE = 56;
const MAX_SPEED = 18;

// The nearest scrollable ancestor — the surface the editor actually scrolls inside.
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let e = el?.parentElement ?? null;
  while (e) {
    const oy = getComputedStyle(e).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && e.scrollHeight > e.clientHeight) return e;
    e = e.parentElement;
  }
  return null;
}

// Notion-style marquee (rubber-band) block selection. Press in the blank editor margin
// and drag: a band picks every row it reaches, and we set a multi-block selection across
// them. BlockNote's drag handle then moves the whole selection as a group.
//
// Pointer-based (not HTML5 drag) for the same reason as the gallery strip: WKWebView
// fires HTML5 drop unreliably. See blockMarquee.ts for the pure geometry/targeting.
//
// The selection is anchored to the *starting row* (by id), not a screen coordinate — so
// scrolling mid-drag extends the selection instead of dropping rows that scrolled away.
// Dragging near an edge auto-scrolls so you can select beyond what's on screen.
export function useBlockMarquee(editor: MarqueeEditor, wrapRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let press: { startX: number; startY: number; active: boolean } | null = null;
    let anchorId: string | null = null; // the row the marquee started in
    let lastX = 0;
    let lastY = 0;
    let band: HTMLDivElement | null = null;
    let scroller: HTMLElement | null = null;
    let raf = 0;
    let suppressClick = false;

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

    // Select from the anchor row to whatever row sits at the current pointer Y. Anchoring
    // by the row's *live* position (not the press coordinate) is what makes scrolling
    // extend the selection rather than lose the top of it.
    const applySelection = () => {
      const rows = topRows();
      if (rows.length === 0) return 0;
      const anchor = rows.find((r) => r.id === anchorId);
      const anchorY = anchor ? (anchor.top + anchor.bottom) / 2 : press!.startY;
      const ids = blocksInBand(rows, { top: anchorY, bottom: lastY });
      if (ids.length >= 2) setRange(ids);
      else if (ids.length === 1) {
        const row = rows.find((r) => r.id === ids[0]);
        if (row) selectSingle(row.el);
      }
      drawBand(anchorY);
      return ids.length;
    };

    const drawBand = (anchorY: number) => {
      if (!band) {
        band = document.createElement("div");
        band.className = "pensieve-marquee";
        document.body.appendChild(band);
      }
      const r = rectBetween(press!.startX, anchorY, lastX, lastY);
      band.style.left = `${r.left}px`;
      band.style.top = `${r.top}px`;
      band.style.width = `${r.width}px`;
      band.style.height = `${r.height}px`;
    };

    // While the pointer sits near a scroll edge, keep scrolling and re-selecting so the
    // band can reach rows off-screen. Runs itself on rAF until it leaves the edge zone.
    const autoScroll = () => {
      raf = 0;
      if (!press?.active) return;
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
      let dy = 0;
      if (lastY < top + EDGE) dy = -MAX_SPEED * Math.min(1, (top + EDGE - lastY) / EDGE);
      else if (lastY > bottom - EDGE) dy = MAX_SPEED * Math.min(1, (lastY - (bottom - EDGE)) / EDGE);
      if (dy !== 0) {
        if (scroller) scroller.scrollBy(0, dy);
        else window.scrollBy(0, dy);
        applySelection();
        raf = requestAnimationFrame(autoScroll);
      }
    };

    const endDrag = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (band) {
        band.remove();
        band = null;
      }
      wrap.classList.remove("pensieve-marqueeing");
      press = null;
      anchorId = null;
      scroller = null;
    };

    const onMove = (e: PointerEvent) => {
      if (!press) return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!press.active) {
        if (Math.abs(e.clientX - press.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - press.startY) < DRAG_THRESHOLD) return;
        press.active = true;
        wrap.classList.add("pensieve-marqueeing");
        scroller = findScrollParent(wrap);
        anchorId = nearestRowId(topRows(), press.startY);
        log.debug("editor", "marquee.start", { anchor: anchorId });
      }
      e.preventDefault();
      applySelection();
      if (!raf) raf = requestAnimationFrame(autoScroll);
    };

    const onUp = () => {
      const wasActive = press?.active ?? false;
      if (wasActive) {
        const n = applySelection();
        suppressClick = true; // swallow the click the browser fires after the drag
        log.debug("editor", "marquee.end", { rows: n });
      }
      endDrag();
      // Focus the editor so the selection is *actionable*: pressing Backspace/Delete or
      // ⌘C/⌘X/⌘V now reaches ProseMirror (the press started in the blank margin, so the
      // contentEditable never got focus on its own). focus() also re-syncs the DOM
      // selection to the stored PM selection, which is what the native copy reads.
      if (wasActive) editor.prosemirrorView?.focus?.();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // primary button only
      if (!isBlankMarqueeTarget(e.target as Element | null, wrap)) return;
      press = { startX: e.clientX, startY: e.clientY, active: false };
      lastX = e.clientX;
      lastY = e.clientY;
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
