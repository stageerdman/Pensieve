// FAST-LOAD: run background work after the first paint, when the main thread is free.
// WKWebView (the native app's webview) has no requestIdleCallback, so we fall back to a
// plain delay. Returns a cancel function (call it from an effect cleanup).

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Run `fn` once the app has settled: at least `delayMs` from now, then at the next idle
 *  slot (or after `timeoutMs` more at the latest). */
export function whenIdle(fn: () => void, delayMs = 800, timeoutMs = 2000): () => void {
  const w = (typeof window !== "undefined" ? window : undefined) as IdleWindow | undefined;
  let idleId: number | undefined;
  let cancelled = false;
  const timer = setTimeout(() => {
    if (cancelled) return;
    if (w?.requestIdleCallback) idleId = w.requestIdleCallback(() => !cancelled && fn(), { timeout: timeoutMs });
    else fn();
  }, delayMs);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (idleId !== undefined) w?.cancelIdleCallback?.(idleId);
  };
}
