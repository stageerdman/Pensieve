// ConjureThread.tsx — the glowing "thought-thread" the wand draws when conjuring a new
// note, plus the container it paints into.
//
// Source ~1014-1032. `conjure` draws an SVG path from the wand button up to the header
// and animates it in, then calls the callback ~170ms later (so the note opens as the
// thread lands). Under reduced motion it just calls back immediately. Imperative SVG +
// WAAPI (the Element.animate used by the prototype) — bypasses React.

export function ConjureThread({ threadRef }: { threadRef: React.RefObject<HTMLDivElement> }) {
  return <div className="thread" ref={threadRef} />;
}

/** Draw the conjure thread into `thread`, measuring against `root` and the wand seat.
 *  Calls `cb` after a short beat (source ~1016-1032). */
export function conjure(thread: HTMLElement | null, root: HTMLElement | null, reduce: boolean, cb: () => void): void {
  if (reduce || !thread || !root) {
    cb();
    return;
  }
  const wandEl = root.querySelector<HTMLElement>('.wact[data-key="wand"]');
  if (!wandEl) {
    cb();
    return;
  }
  const w = wandEl.getBoundingClientRect();
  const sc = root.getBoundingClientRect();
  const x = w.left + w.width / 2 - sc.left,
    y = w.top + w.height / 2 - sc.top;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(sc.width));
  svg.setAttribute("height", String(sc.height));
  svg.style.cssText = "position:absolute;inset:0";
  svg.innerHTML = `<defs><linearGradient id="thr" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0%" stop-color="hsl(218 100% 72%)" stop-opacity="0"/><stop offset="60%" stop-color="hsl(215 85% 74%)" stop-opacity=".9"/><stop offset="100%" stop-color="#fff"/></linearGradient></defs>
    <path d="M${x} ${y} C ${x - 40} ${y - 160}, ${x + 60} ${y - 300}, ${sc.width / 2} 150" stroke="url(#thr)" stroke-width="2.5" fill="none" stroke-linecap="round" style="filter:drop-shadow(0 0 6px hsl(218 100% 72% / .8))"/>`;
  thread.appendChild(svg);
  const p = svg.querySelector("path");
  if (p) {
    p.style.strokeDasharray = "600";
    p.animate([{ strokeDashoffset: 600 }, { strokeDashoffset: 0 }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
    const fade = p.animate([{ opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 640, easing: "ease-out" });
    fade.onfinish = () => svg.remove();
  }
  setTimeout(cb, 170);
}
