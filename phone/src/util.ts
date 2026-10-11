// util.ts — tiny phone-wide helpers (browser-touching, so not in lib/).

/** Light haptic tick. Source ~555: `navigator.vibrate && navigator.vibrate(ms)`. */
export function haptic(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported — no-op */
  }
}

/** Whether the user prefers reduced motion. Source ~554. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Escape a string for safe insertion as HTML (note body innerHTML). Source ~639. */
export function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
