// tapDom.ts — "tap to act" on a block inside the note body, without raising the keyboard.
//
// Why this is more than a click handler: blocks are `contentEditable=false` inside the
// contentEditable body. On iOS a tap that lands on one still focuses the body (places the caret
// at the nearest editable spot) and pops the keyboard — and iOS drives that from the TOUCH
// sequence, not the synthesized `mousedown`, so `mousedown.preventDefault()` alone doesn't stop
// it. The fix: on a genuine tap (touch released without scrolling) we `preventDefault()` the
// `touchend`, which suppresses BOTH the editable focus and the ghost click, then act ourselves.
// A scroll (finger moved past the threshold) is left untouched so the page still scrolls when the
// drag starts on a block. Mouse/desktop falls through to `click`.

const TAP_SLOP_PX = 10;

/** Drop focus off the contentEditable body so iOS dismisses the keyboard. */
export function blurActive() {
  (document.activeElement as HTMLElement | null)?.blur?.();
}

export function wireMediaTap(el: HTMLElement, onTap: (clientX: number) => void) {
  let sx = 0;
  let sy = 0;
  let moved = false;
  let lastTouchTapAt = 0;

  el.addEventListener("mousedown", (e) => e.preventDefault()); // mouse: don't focus the editable
  el.addEventListener(
    "touchstart",
    (e) => {
      moved = false;
      const t = e.touches[0];
      sx = t ? t.clientX : 0;
      sy = t ? t.clientY : 0;
    },
    { passive: true },
  );
  el.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - sx) > TAP_SLOP_PX || Math.abs(t.clientY - sy) > TAP_SLOP_PX) moved = true;
    },
    { passive: true },
  );
  el.addEventListener(
    "touchend",
    (e) => {
      if (moved) return; // a scroll, not a tap — let the keyboard/scroll behave normally
      if (e.cancelable) e.preventDefault(); // stop iOS focusing the editable + the ghost click
      lastTouchTapAt = Date.now();
      blurActive();
      onTap(sx);
    },
    { passive: false },
  );
  el.addEventListener("click", (e) => {
    if (Date.now() - lastTouchTapAt < 700) return; // the touchend tap already handled this
    blurActive();
    onTap((e as MouseEvent).clientX);
  });
}
