// phoneSetup.ts — jsdom shims for booting The Wand under Vitest (the technique from
// the phone update's wiki). The root src/test/setup.ts already aliases PointerEvent →
// MouseEvent + stubs pointer capture + localStorage; this adds the rest the Wand's
// rAF/visualViewport/WAAPI code needs so it can mount and be driven as real DOM.

// requestAnimationFrame / cancelAnimationFrame via macrotasks (NOT synchronous — the
// wheel's spring loop reschedules itself every frame, and a synchronous rAF would
// recurse until the stack blew). cb receives a timestamp like the real API.
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
}

// WAAPI — the conjure thread + prototype use Element.animate; jsdom ships none.
if (!("animate" in Element.prototype)) {
  (Element.prototype as unknown as { animate: unknown }).animate = function animate() {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation;
  };
}

// scrollTo — the settle + new-note scroll use it; jsdom treats it as a no-op anyway.
if (!("scrollTo" in Element.prototype)) {
  (Element.prototype as unknown as { scrollTo: unknown }).scrollTo = function scrollTo() {};
}
if (typeof window.scrollTo !== "function") {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}

// visualViewport — the SINGLE source of truth for "is the keyboard up". A resizable
// fake so a test can simulate the keyboard by shrinking height + firing "resize".
if (!window.visualViewport) {
  const listeners: Record<string, Set<(e: Event) => void>> = {};
  const vv = {
    width: window.innerWidth || 390,
    height: window.innerHeight || 844,
    offsetTop: 0,
    offsetLeft: 0,
    scale: 1,
    addEventListener(type: string, cb: (e: Event) => void) {
      (listeners[type] ||= new Set()).add(cb);
    },
    removeEventListener(type: string, cb: (e: Event) => void) {
      listeners[type]?.delete(cb);
    },
    dispatchEvent(e: Event) {
      listeners[e.type]?.forEach((cb) => cb(e));
      return true;
    },
  };
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
}
