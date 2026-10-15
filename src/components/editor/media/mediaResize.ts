import { useCallback, useRef } from "react";

// Pointer wiring for a media block's resize/reshape handles. Kept separate from ImageBlock so
// the tricky event-plumbing (why it must be NATIVE mousedown, not React's synthetic) is isolated
// and unit-testable.
//
// Why native, not React onPointerDown/onMouseDown (verified against prosemirror-view + @tiptap
// NodeView source): ProseMirror listens for `mousedown` on its own editor DOM and, for a
// selectable custom block, starts its OWN node-drag/selection gesture unless that real mousedown
// is already `defaultPrevented` by the time it bubbles up to the editor DOM (prosemirror-view
// `eventBelongsToView`). Only a listener attached to the handle element itself runs early enough
// to preventDefault the real mousedown. A React synthetic handler is delegated at the app root —
// BELOW the editor DOM in the bubble path — so it fires too late; and ProseMirror never listens
// for pointer events at all, so a pointerdown-based approach could never stop the gesture. This
// mirrors BlockNote's own createResizableFileBlockWrapper (native mousedown + preventDefault).

/** Track a resize/reshape drag once a handle press has started. Window-level mouse+touch
 *  move/up (bubble phase — nothing in ProseMirror/BlockNote stops these); `onMove` gets live
 *  client coords until release. Returns nothing; self-cleans on mouseup/touchend. */
export function runResizeDrag(onMove: (clientX: number, clientY: number) => void): void {
  document.body.classList.add("pensieve-resizing");
  const move = (ev: MouseEvent | TouchEvent) => {
    const p = "touches" in ev ? ev.touches[0] : ev;
    if (p) onMove(p.clientX, p.clientY);
  };
  const end = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("mouseup", end);
    window.removeEventListener("touchend", end);
    document.body.classList.remove("pensieve-resizing");
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("mouseup", end);
  window.addEventListener("touchend", end);
}

/** Ref callback that attaches a NATIVE mousedown/touchstart to a resize handle (see file header
 *  for why native is required). `start` receives the press's client coords; it should capture the
 *  start geometry and call runResizeDrag. The returned callback is stable across renders and
 *  re-attaches cleanly if the handle element changes or unmounts. */
export function useResizeHandle(start: (clientX: number, clientY: number) => void) {
  const startRef = useRef(start);
  startRef.current = start;
  const elRef = useRef<HTMLElement | null>(null);
  const onDown = useRef((e: MouseEvent | TouchEvent) => {
    if ("button" in e && e.button !== 0) return; // primary mouse button only
    e.preventDefault(); // defaultPrevented real mousedown → ProseMirror ignores it (no gesture, no text-select)
    e.stopPropagation();
    const p = "touches" in e ? e.touches[0] : (e as MouseEvent);
    if (p) startRef.current(p.clientX, p.clientY);
  }).current;
  return useCallback(
    (el: HTMLElement | null) => {
      if (elRef.current) {
        elRef.current.removeEventListener("mousedown", onDown);
        elRef.current.removeEventListener("touchstart", onDown);
      }
      elRef.current = el;
      if (el) {
        el.addEventListener("mousedown", onDown);
        el.addEventListener("touchstart", onDown, { passive: false });
      }
    },
    [onDown],
  );
}
