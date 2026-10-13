// useKeyboardInset.ts — the SINGLE source of truth for "is the keyboard up".
//
// Ported from 01-the-wand-v2.html ~561-588 (`updateKB`, the visualViewport listeners).
// The real keyboard inset is `innerHeight - vv.height - vv.offsetTop`; it is written
// to the `--kb` CSS var every frame (so bars ride above the keyboard) and crossing
// ~80px flips `.kb-open`. The menu hides on `.kb-open`, NEVER on focus (wiki: a
// programmatic focus that doesn't raise the keyboard must leave the menu present).

import { useEffect, useRef } from "react";

export interface KeyboardInsetCallbacks {
  /** Keyboard CONFIRMED up (crossed the threshold). */
  onUp?: () => void;
  /** Keyboard dropped. */
  onDown?: () => void;
}

export interface KeyboardInset {
  /** Live keyboard inset in px (ref so reads never trigger renders). */
  kbRef: React.MutableRefObject<number>;
  /** Whether the keyboard is currently up (ref). */
  upRef: React.MutableRefObject<boolean>;
}

/** Binds visualViewport, writes `--kb` onto `rootRef`, and reports up/down
 *  transitions via stable callbacks. */
export function useKeyboardInset(
  rootRef: React.RefObject<HTMLElement>,
  cb: KeyboardInsetCallbacks,
): KeyboardInset {
  const kbRef = useRef(0);
  const upRef = useRef(false);
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    const vv = window.visualViewport;
    const root = rootRef.current;
    function updateKB() {
      if (!vv || !root) return;
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      kbRef.current = kb;
      root.style.setProperty("--kb", kb + "px");
      // The app shell NEVER moves. We used to translateY(vv.offsetTop) to "compensate"
      // for iOS's visual-viewport pan, but that transform could get stuck and shove the
      // whole screen up with no way back — and on desktop a focus-driven scrollIntoView
      // of the overflow:hidden shell did the same (the "shifts up and never returns"
      // bug). Our bars ride above the keyboard via the --kb var, so nothing needs to
      // move; we keep the document pinned at 0 and clear any stale transform.
      const se = document.scrollingElement as HTMLElement | null;
      if (window.scrollY || (se && se.scrollTop)) {
        window.scrollTo(0, 0);
        if (se) se.scrollTop = 0;
      }
      if (root.style.transform) root.style.transform = "";
      const up = kb > 80;
      if (up !== upRef.current) {
        upRef.current = up;
        if (up) cbRef.current.onUp?.();
        else cbRef.current.onDown?.();
      }
    }
    if (vv) {
      vv.addEventListener("resize", updateKB);
      vv.addEventListener("scroll", updateKB);
      updateKB();
    }
    return () => {
      if (vv) {
        vv.removeEventListener("resize", updateKB);
        vv.removeEventListener("scroll", updateKB);
      }
      root?.style.removeProperty("--kb");
      if (root) root.style.transform = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { kbRef, upRef };
}
